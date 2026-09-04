import { NextResponse } from "next/server";
import { fetchRatedFilms, LetterboxdError } from "@/lib/letterboxd";
import { lookupFilms } from "@/lib/tmdb";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Fetching the user's own ratings still means scraping Letterboxd's diary,
// paced by a shared rate limiter — a very large profile would otherwise turn
// one request into a long crawl. Cap to the N most recently *watched* films
// instead (the diary lists exactly 100 per page, so 100 is a single request).
const MAX_FILMS = Number(process.env.LB_MAX_FILMS) || 100;

export interface RatingPoint {
  slug: string;
  name: string;
  year: number | null;
  link: string;
  userRating: number;
  /** TMDB's average rating, converted from its 0-10 scale to /5 to line up with userRating. */
  avgRating: number;
  ratingCount: number | null;
  posterUrl: string | null;
}

export interface RatingsResponse {
  username: string;
  /** Total films watched, per Letterboxd's own count — includes unrated films, so it can exceed points.length even when nothing was truncated. */
  totalWatched: number | null;
  truncated: boolean;
  incomplete: boolean;
  points: RatingPoint[];
}

export async function POST(req: Request) {
  let body: { username?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const rawUsername = typeof body.username === "string" ? body.username : "";
  if (!rawUsername.trim()) {
    return NextResponse.json({ error: "A Letterboxd username is required." }, { status: 400 });
  }

  try {
    const { entries, totalWatched, truncated, incomplete } = await fetchRatedFilms(rawUsername, MAX_FILMS);
    const toEnrich = entries.slice(0, MAX_FILMS);

    const details = await lookupFilms(toEnrich);

    const points: RatingPoint[] = [];
    for (const film of toEnrich) {
      const detail = details.get(film.slug);
      if (!detail || detail.avgRating === null) continue; // no TMDB match (or no votes) to plot against
      points.push({
        slug: film.slug,
        name: film.name,
        year: film.year,
        link: film.link,
        userRating: film.userRating,
        avgRating: detail.avgRating,
        ratingCount: detail.ratingCount,
        posterUrl: detail.posterUrl,
      });
    }

    const response: RatingsResponse = {
      username: rawUsername.trim(),
      totalWatched,
      truncated,
      incomplete,
      points,
    };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof LetterboxdError) {
      const status = err.code === "invalid_username" ? 400 : 404;
      return NextResponse.json({ error: err.message, code: err.code }, { status });
    }
    console.error(err);
    return NextResponse.json({ error: "Something went wrong while loading that profile." }, { status: 500 });
  }
}
