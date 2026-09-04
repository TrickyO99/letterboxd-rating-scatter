const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p/w185";

// The average rating plotted against the user's own comes from TMDB, not
// Letterboxd: TMDB is a plain, unblocked HTTP API (no Cloudflare bot-wall,
// full concurrency, no per-film browser page-load), where Letterboxd's own
// average is only reachable by scraping a real browser through it one film
// at a time. The tradeoff is real — TMDB's voting audience isn't
// Letterboxd's — but it's the number this app can actually deliver quickly
// and reliably. TMDB's scale is 0-10; converted to /5 here so it lines up
// directly with the user's own (0.5-5) Letterboxd rating on the same axis.
export interface TmdbFilmDetails {
  posterUrl: string | null;
  avgRating: number | null;
  ratingCount: number | null;
}

const EMPTY: TmdbFilmDetails = { posterUrl: null, avgRating: null, ratingCount: null };

interface TmdbSearchResult {
  poster_path: string | null;
  vote_average?: number;
  vote_count?: number;
}

async function lookupFilm(name: string, year: number | null): Promise<TmdbFilmDetails> {
  if (!TMDB_API_KEY) return EMPTY;

  try {
    const params = new URLSearchParams({ api_key: TMDB_API_KEY, query: name });
    if (year) params.set("primary_release_year", String(year));

    const res = await fetch(`${TMDB_BASE}/search/movie?${params.toString()}`);
    if (!res.ok) return EMPTY;

    const data = (await res.json()) as { results?: TmdbSearchResult[] };
    const match = data.results?.[0];
    if (!match) return EMPTY;

    return {
      posterUrl: match.poster_path ? `${IMAGE_BASE}${match.poster_path}` : null,
      avgRating: match.vote_count && match.vote_count > 0 ? Math.round((match.vote_average! / 2) * 100) / 100 : null,
      ratingCount: match.vote_count ?? null,
    };
  } catch {
    return EMPTY;
  }
}

const CONCURRENCY = 10;

export async function lookupFilms<T extends { slug: string; name: string; year: number | null }>(
  films: T[]
): Promise<Map<string, TmdbFilmDetails>> {
  const results = new Map<string, TmdbFilmDetails>();
  if (!TMDB_API_KEY) return results;

  let next = 0;
  async function worker() {
    while (next < films.length) {
      const f = films[next++];
      results.set(f.slug, await lookupFilm(f.name, f.year));
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, films.length) }, worker));
  return results;
}
