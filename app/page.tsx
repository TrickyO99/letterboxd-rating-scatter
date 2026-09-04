"use client";

import { useState } from "react";
import { ScatterChart } from "@/components/ScatterChart";
import { RatingsTable } from "@/components/RatingsTable";
import type { RatingsResponse } from "@/app/api/ratings/route";

export default function Home() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<RatingsResponse | null>(null);
  const [showTable, setShowTable] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim() || loading) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/ratings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong.");
        return;
      }
      setResult(data);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const yourAvg =
    result && result.points.length > 0
      ? result.points.reduce((s, p) => s + p.userRating, 0) / result.points.length
      : null;
  const crowdAvg =
    result && result.points.length > 0
      ? result.points.reduce((s, p) => s + p.avgRating, 0) / result.points.length
      : null;

  return (
    <>
      <header className="relative z-10 px-4 pt-6 sm:px-8">
        <a
          href="https://odtriki.com"
          className="inline-flex items-center gap-2 font-serif text-sm font-semibold"
          style={{ color: "var(--cream)" }}
        >
          <span aria-hidden className="inline-block h-2 w-2 rounded-[2px]" style={{ background: "var(--orange)" }} />
          Othmane Triki
        </a>
      </header>

      <main className="relative z-10 flex-1 flex flex-col items-center px-4 py-10 gap-10 max-w-4xl mx-auto w-full">
        <div className="text-center space-y-3 max-w-xl">
          <p
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em]"
            style={{ color: "var(--orange)" }}
          >
            <svg viewBox="0 0 22 22" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
              <polyline points="3,3 3,19 19,19" />
              <circle cx="7" cy="14" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="11" cy="9" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="14.5" cy="13" r="1.2" fill="currentColor" stroke="none" />
              <circle cx="17" cy="6" r="1.2" fill="currentColor" stroke="none" />
            </svg>
            Letterboxd, plotted
          </p>
          <h1 className="font-serif text-4xl sm:text-5xl font-semibold tracking-tight leading-[1.05]" style={{ color: "var(--cream)" }}>
            Scatter<span style={{ color: "var(--orange)" }}>boxd</span>
          </h1>
          <p style={{ color: "var(--muted)" }}>
            Enter a public Letterboxd username to plot your ratings against each film&apos;s TMDB
            average.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2 w-full max-w-sm">
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="letterboxd username"
            className="flex-1 rounded-full border px-4 py-2 text-sm outline-none transition-colors focus:border-[var(--orange)]"
            style={{ borderColor: "var(--border)", background: "var(--card)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)" as string, boxShadow: "var(--glass-shadow)", color: "var(--cream)" }}
          />
          <button
            type="submit"
            disabled={loading}
            className="rounded-full px-5 py-2 text-sm font-semibold disabled:opacity-50 transition-all hover:-translate-y-px"
            style={{ background: "var(--orange)", color: "var(--ink)" }}
          >
            {loading ? "Plotting…" : "Plot"}
          </button>
        </form>

        {loading && (
          <div className="flex flex-col items-center gap-3 w-full max-w-xs">
            <div
              className="h-8 w-8 rounded-full border-[3px] animate-spin"
              style={{ borderColor: "var(--border)", borderTopColor: "var(--orange)" }}
            />
            <p className="text-sm text-center" style={{ color: "var(--muted)" }}>
              Fetching ratings from Letterboxd — large profiles can take a couple of minutes.
            </p>
          </div>
        )}

        {error && (
          <p
            className="text-sm rounded-full border px-4 py-2"
            style={{ borderColor: "var(--danger)", color: "var(--danger)", background: "var(--card)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)" as string, boxShadow: "var(--glass-shadow)" }}
          >
            {error}
          </p>
        )}

        {result && (
          <div className="w-full flex flex-col gap-4">
            {result.points.length === 0 ? (
              <p className="text-center text-sm" style={{ color: "var(--muted)" }}>
                No rated films with a TMDB average were found for {result.username}. If this
                keeps happening for every profile, double-check TMDB_API_KEY is set in
                .env.local — without it, nothing can be plotted.
              </p>
            ) : (
              <div className="rounded-2xl border p-5 sm:p-8 flex flex-col gap-4" style={{ borderColor: "var(--border)", background: "var(--card)", backdropFilter: "var(--glass-blur)", WebkitBackdropFilter: "var(--glass-blur)" as string, boxShadow: "var(--glass-shadow)" }}>
                <div className="flex flex-wrap justify-center gap-8 text-center">
                  <Stat label="Films plotted" value={result.points.length.toLocaleString()} accent />
                  {yourAvg !== null && <Stat label="Your average" value={yourAvg.toFixed(2)} />}
                  {crowdAvg !== null && <Stat label="TMDB average" value={crowdAvg.toFixed(2)} />}
                  {result.totalWatched !== null && (
                    <Stat label="Films watched (Letterboxd)" value={result.totalWatched.toLocaleString()} />
                  )}
                </div>

                {(result.truncated || result.incomplete) && (
                  <p className="text-center text-xs" style={{ color: "var(--text-muted)" }}>
                    {result.truncated &&
                      `Showing your ${result.points.length} most recently watched films. `}
                    {result.incomplete && "Letterboxd briefly rate-limited the crawl, so this list may be partial."}
                  </p>
                )}

                <ScatterChart points={result.points} />

                <div className="flex justify-center">
                  <button
                    onClick={() => setShowTable((v) => !v)}
                    className="text-sm underline transition-colors hover:text-[var(--orange)]"
                    style={{ color: "var(--muted)" }}
                  >
                    {showTable ? "Hide table" : "Show as table"}
                  </button>
                </div>

                {showTable && <RatingsTable points={result.points} />}
              </div>
            )}
          </div>
        )}
      </main>

      <footer
        className="relative z-10 border-t px-4 py-8 text-center text-sm sm:px-8"
        style={{ borderColor: "var(--border)", color: "var(--muted)", background: "rgba(15,25,90,0.35)" }}
      >
        <a href="https://odtriki.com" className="font-medium hover:text-[var(--orange)]" style={{ color: "var(--cream)" }}>
          odtriki.com
        </a>
        <span aria-hidden className="inline-block mx-2 h-1 w-1 rounded-[1px] align-middle" style={{ background: "var(--orange)" }} />
        one of a few side projects
      </footer>
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div>
      <div
        className="font-serif text-2xl font-semibold"
        style={{ color: accent ? "var(--orange)" : "var(--cream)" }}
      >
        {value}
      </div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}
