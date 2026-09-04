# Letterboxd Rating Scatter

Enter a public Letterboxd username and get a scatter plot of your ratings (x-axis)
against each film's TMDB average rating (y-axis). Click a dot to open the film's
Letterboxd page; hover for its poster, title, and both ratings.

## Why TMDB for the average, not Letterboxd

Letterboxd's own community average is only reachable by scraping a real browser
through it, one film at a time — Letterboxd has no self-serve public API, and their
real one is gated behind manual partner approval. That works, but scraping ~100
different film pages back-to-back is exactly the kind of pattern Cloudflare (which
fronts letterboxd.com) rate-limits hardest, and a block cascades badly under
concurrency (see git history on `lib/letterboxd.ts` if curious).

TMDB's `vote_average` is a plain, unblocked, fully-parallel API call — and it's
*not* the same number (different voting audience, 0-10 scale here converted to /5
to line up with your Letterboxd rating). That's a real tradeoff: this app plots
"your rating vs. what TMDB's audience thinks," not "vs. what Letterboxd's audience
thinks." It's the number this app can actually deliver quickly and reliably.

## How it works

- **Your ratings**: [`lib/letterboxd.ts`](lib/letterboxd.ts) scrapes
  `https://letterboxd.com/<user>/diary/` (and `/diary/films/page/N/` beyond the
  first page) for your own star rating per film (read off each row's `rated-N`
  class), ordered by the date the film was actually *watched* — not date rated,
  not date added to Letterboxd, which can differ for backfilled diary entries. The
  diary lists exactly 100 entries per page, so the default 100-film cap is a single
  request.
  - Requests go through a real (stealth-patched) Chromium instance via Playwright
    ([`lib/browser.ts`](lib/browser.ts)), because Cloudflare reliably 403s plain
    HTTP clients — confirmed against both curl and Node's `fetch` — after a
    handful of requests. A small pool of already-open tabs is reused across
    requests instead of opening and closing one per page, to cut down on
    unnecessary overhead.
- **Average rating + poster**: both come from
  [TMDB's API](https://www.themoviedb.org/documentation/api)
  ([`lib/tmdb.ts`](lib/tmdb.ts)) in one request per film, matched by name + year,
  run at full concurrency.
- [`app/api/ratings/route.ts`](app/api/ratings/route.ts) combines the two and
  returns the plottable points; [`components/ScatterChart.tsx`](components/ScatterChart.tsx)
  renders them.

## Setup

```bash
npm install
npx playwright install chromium
cp .env.local.example .env.local   # add your TMDB_API_KEY — required
npm run dev
```

Get a free TMDB API key at https://www.themoviedb.org/settings/api. Without one,
`lookupFilms` returns nothing and every film is dropped (no average rating to plot
against), so the chart comes back empty.

Open http://localhost:3000 and enter a public Letterboxd username.

## Known limitations

- **Private profiles** can't be scraped and return an error.
- **Capped to recent activity**: only the `LB_MAX_FILMS` (default 100) most
  recently *watched* films are plotted — scraping beyond one diary page is rate
  limited and slow, so raising this a lot will take noticeably longer. Adjust via
  `.env.local`.
- **TMDB, not Letterboxd**: the "average" is TMDB's voting audience, not
  Letterboxd's — see above. Films need a name+year match in TMDB's catalog and at
  least one vote there; obscure titles, unusual re-releases, or TMDB entries with
  no votes are silently excluded from the plot.
