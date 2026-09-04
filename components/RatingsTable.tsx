"use client";

import type { RatingPoint } from "@/app/api/ratings/route";

export function RatingsTable({ points }: { points: RatingPoint[] }) {
  const sorted = [...points].sort(
    (a, b) => Math.abs(b.userRating - b.avgRating) - Math.abs(a.userRating - a.avgRating)
  );

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--gridline)" }}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left" style={{ color: "var(--text-muted)" }}>
            <th className="p-2 font-medium"></th>
            <th className="p-2 font-medium">Film</th>
            <th className="p-2 font-medium text-right">Your rating</th>
            <th className="p-2 font-medium text-right">TMDB avg</th>
            <th className="p-2 font-medium text-right">Difference</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p) => {
            const diff = p.userRating - p.avgRating;
            return (
              <tr key={p.slug} className="border-t" style={{ borderColor: "var(--gridline)" }}>
                <td className="p-2">
                  {p.posterUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.posterUrl} alt="" width={28} height={42} className="rounded object-cover" />
                  )}
                </td>
                <td className="p-2">
                  <a
                    href={p.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline hover:text-[var(--accent-primary)] transition-colors"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {p.name}
                    {p.year ? ` (${p.year})` : ""}
                  </a>
                </td>
                <td className="p-2 text-right tabular-nums">{p.userRating.toFixed(1)}</td>
                <td className="p-2 text-right tabular-nums">{p.avgRating.toFixed(2)}</td>
                <td
                  className="p-2 text-right tabular-nums font-medium"
                  style={{ color: diff > 0 ? "var(--diverging-warm)" : diff < 0 ? "var(--diverging-cool)" : "var(--text-muted)" }}
                >
                  {diff > 0 ? "+" : ""}
                  {diff.toFixed(2)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
