import * as cheerio from "cheerio";
import type { Page } from "playwright-core";
import { getContext } from "./browser";

const BASE_URL = "https://letterboxd.com";

const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,32}$/;

export type LetterboxdErrorCode = "invalid_username" | "not_found" | "private" | "upstream_error";

export class LetterboxdError extends Error {
  code: LetterboxdErrorCode;
  username: string;

  constructor(code: LetterboxdErrorCode, username: string, message: string) {
    super(message);
    this.code = code;
    this.username = username;
  }
}

export interface FilmEntry {
  slug: string;
  name: string;
  year: number | null;
  link: string;
  /** This user's own star rating for the film (0.5-5, half-star steps). Always non-null in fetchRatedFilms's result. */
  userRating: number;
}

export function assertValidUsername(username: string): string {
  const trimmed = username.trim();
  if (!USERNAME_PATTERN.test(trimmed)) {
    throw new LetterboxdError(
      "invalid_username",
      trimmed,
      `"${username}" doesn't look like a valid Letterboxd username.`
    );
  }
  return trimmed;
}

const RETRYABLE_STATUSES = new Set([403, 429, 500, 502, 503, 504]);
// Each attempt can itself wait up to ~12s riding out a Cloudflare JS
// challenge (see rawGet) before even reaching this retry's backoff sleep —
// observed compounding into 60-100+ seconds of retries under real load with
// 4 attempts and several concurrent requests all retrying at once. Fewer,
// cheaper attempts fail faster and let the caller move on.
const MAX_ATTEMPTS = 2;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Cloudflare (fronting letterboxd.com) rate-limits requests from one source
// by both concurrency and sustained rate. This limiter caps concurrent
// in-flight requests AND paces how often a new one can start, regardless of
// how many pages/films are being fetched at once.
//
// It also owns a small pool of already-open Playwright pages (one per
// concurrency slot) instead of opening a fresh tab and tearing it down for
// every single request. A hundred individual film lookups were each paying
// full tab-creation overhead for no reason — a real browsing session reuses
// its tabs across navigations too, so this is both faster and a more
// realistic traffic pattern, not just an optimization.
class RateLimiter {
  private available: number;
  private waiters: (() => void)[] = [];
  private nextSlotAt = 0;
  private pagePool: Page[] = [];

  constructor(
    private maxConcurrent: number,
    private minIntervalMs: number
  ) {
    this.available = maxConcurrent;
  }

  async acquire(): Promise<{ page: Page; release: (discard?: boolean) => void }> {
    if (this.available <= 0) {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
    }
    this.available--;

    const now = Date.now();
    const waitMs = Math.max(0, this.nextSlotAt - now);
    this.nextSlotAt = Math.max(now, this.nextSlotAt) + this.minIntervalMs;
    if (waitMs > 0) await sleep(waitMs);

    const page = this.pagePool.pop() ?? (await (await getContext()).newPage());

    return {
      page,
      release: (discard = false) => {
        // A page that just errored (crashed, navigation failure) might be in
        // a bad state — close it instead of handing a possibly-broken tab to
        // the next caller.
        if (discard) page.close().catch(() => {});
        else this.pagePool.push(page);

        this.available++;
        const next = this.waiters.shift();
        if (next) next();
      },
    };
  }
}

// A user's own "/<username>/diary/films/page/N/" pagination (page 2+) gets
// hard-blocked almost immediately in practice — observed consistently across
// many test runs — suggesting a much stricter, path-specific rate-limit rule
// upstream. Give it its own fully-serialized, slow-paced lane. Everything
// else (the diary's first page, which covers the common case of maxFilms
// <= 100 in a single request) shares the general lane.
const generalLimiter = new RateLimiter(2, 800);
const filmsLimiter = new RateLimiter(1, 7000);

function limiterFor(path: string): RateLimiter {
  return path.includes("/films/") ? filmsLimiter : generalLimiter;
}

function isCloudflareChallenge(body: string): boolean {
  return body.includes("Just a moment") || body.includes("challenges.cloudflare.com");
}

// A real Chromium instance (via Playwright) presents a genuine browser TLS/JS
// fingerprint, which Cloudflare's bot protection (fronting letterboxd.com)
// reliably let through — unlike a plain Node/curl request, which gets 403'd
// after a handful of sequential requests in the same session. Occasionally
// Cloudflare still serves an interactive JS challenge ("Just a moment...");
// a real browser resolves that client-side within a few seconds and gets a
// clearance cookie, so we wait it out and reload rather than treating the
// interstitial itself as the response.
async function rawGet(page: Page, path: string, referer?: string): Promise<{ status: number; body: string }> {
  let response = await page.goto(`${BASE_URL}${path}`, {
    waitUntil: "domcontentloaded",
    referer,
  });
  let body = await page.content();

  for (let i = 0; i < 2 && isCloudflareChallenge(body); i++) {
    await page.waitForTimeout(6000);
    response = await page.reload({ waitUntil: "domcontentloaded" });
    body = await page.content();
  }

  const status = response?.status() ?? 0;
  return { status, body };
}

async function fetchHtml(path: string, username: string, referer?: string): Promise<string> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const { page, release } = await limiterFor(path).acquire();
    let status: number;
    let body: string;
    let errored = false;
    try {
      ({ status, body } = await rawGet(page, path, referer));
    } catch {
      status = 0;
      body = "";
      errored = true;
    } finally {
      release(errored);
    }

    if (status === 0) {
      lastStatus = 0;
      if (attempt === MAX_ATTEMPTS) break;
      await sleep(2000 * attempt);
      continue;
    }

    if (status === 404) {
      throw new LetterboxdError("not_found", username, `Letterboxd user "${username}" wasn't found.`);
    }
    if (status === 403 && body.includes("template'] = '/errors/forbidden'")) {
      throw new LetterboxdError("private", username, `${username}'s film list is private.`);
    }
    if (status >= 200 && status < 300) {
      return body;
    }

    lastStatus = status;
    if (!RETRYABLE_STATUSES.has(status) || attempt === MAX_ATTEMPTS) {
      break;
    }
    await sleep(2000 * attempt);
  }

  throw new LetterboxdError(
    "upstream_error",
    username,
    `Letterboxd returned an error (${lastStatus}) while loading "${username}". It may be temporarily blocking requests — try again in a moment.`
  );
}

/** Parses one page of the user's diary — sorted by the date they actually watched each film (not date rated or date added). */
function parseDiaryRows(html: string): FilmEntry[] {
  const $ = cheerio.load(html);
  const entries: FilmEntry[] = [];

  $("tr.diary-entry-row").each((_, row) => {
    const node = $(row).find('.react-component[data-component-class="LazyPoster"]').first();
    const slug = node.attr("data-item-slug");
    const itemName = node.attr("data-item-name");
    const link = node.attr("data-item-link");
    if (!slug || !itemName || !link) return;

    const ratingClass = $(row).find("span.rating").attr("class");
    const ratingMatch = ratingClass?.match(/rated-(\d+)/);
    if (!ratingMatch) return; // unrated film — nothing to plot on the x-axis

    const yearMatch = itemName.match(/\((\d{4})\)\s*$/);
    const year = yearMatch ? parseInt(yearMatch[1], 10) : null;
    const name = yearMatch ? itemName.slice(0, yearMatch.index).trim() : itemName.trim();

    entries.push({
      slug,
      name,
      year,
      link: `${BASE_URL}${link}`,
      userRating: parseInt(ratingMatch[1], 10) / 2,
    });
  });

  return entries;
}

function getLastPage(html: string): number {
  const $ = cheerio.load(html);
  let last = 1;
  $(".paginate-pages a").each((_, el) => {
    const href = $(el).attr("href") ?? "";
    const match = href.match(/\/page\/(\d+)\//);
    if (match) {
      const page = parseInt(match[1], 10);
      if (page > last) last = page;
    }
  });
  return last;
}

/** Reads the "N films" count Letterboxd shows in the list header — informational only (it's total watched, not total *rated*). */
function getTotalWatched(html: string): number | null {
  const match = html.match(/title="([\d,]+)&nbsp;films"/);
  return match ? parseInt(match[1].replace(/,/g, ""), 10) : null;
}

export interface FetchRatedFilmsResult {
  entries: FilmEntry[];
  /** Total films watched (rated + unrated), read off the list header — informational, not the count of rated films. */
  totalWatched: number | null;
  /** True if pagination stopped before the last page — either because it hit maxFilms, or because it got blocked. */
  truncated: boolean;
  /** True if pagination was specifically cut short by a block/error, rather than by maxFilms. */
  incomplete: boolean;
}

/**
 * Fetches films from the user's diary — sorted by the date each film was
 * actually *watched* (not date rated, not date added to Letterboxd) — that
 * carry their own star rating, stopping once at least `maxFilms` have been
 * found. The diary lists exactly 100 entries per page, so the common case
 * (maxFilms <= 100) is a single request; pagination beyond that is rate
 * limited and slow, so for a profile with thousands of entries, walking
 * every page before ever applying the cap would dominate the whole request.
 */
export async function fetchRatedFilms(username: string, maxFilms: number): Promise<FetchRatedFilmsResult> {
  const safeUsername = assertValidUsername(username);
  const profileUrl = `${BASE_URL}/${safeUsername}/`;
  const firstPageHtml = await fetchHtml(`/${safeUsername}/diary/`, safeUsername, profileUrl);

  const totalWatched = getTotalWatched(firstPageHtml);
  const lastPage = getLastPage(firstPageHtml);
  const byslug = new Map<string, FilmEntry>();
  for (const entry of parseDiaryRows(firstPageHtml)) byslug.set(entry.slug, entry);

  let referer = `${BASE_URL}/${safeUsername}/diary/`;
  let incomplete = false;
  let truncated = byslug.size >= maxFilms;
  for (let page = 2; page <= lastPage && byslug.size < maxFilms; page++) {
    let html: string;
    try {
      html = await fetchHtml(`/${safeUsername}/diary/films/page/${page}/`, safeUsername, referer);
    } catch (err) {
      if (err instanceof LetterboxdError && err.code === "upstream_error") {
        // Letterboxd/Cloudflare blocked further pagination — keep what we
        // already have rather than discarding a partial result.
        incomplete = true;
        truncated = true;
        break;
      }
      throw err;
    }
    referer = `${BASE_URL}/${safeUsername}/diary/films/page/${page}/`;
    for (const entry of parseDiaryRows(html)) byslug.set(entry.slug, entry);
    if (byslug.size >= maxFilms) truncated = true;
  }

  return {
    entries: Array.from(byslug.values()).slice(0, maxFilms),
    totalWatched,
    truncated,
    incomplete,
  };
}

