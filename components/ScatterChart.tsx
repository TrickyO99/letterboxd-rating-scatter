"use client";

import { useRef, useState } from "react";
import type { RatingPoint } from "@/app/api/ratings/route";

const DOMAIN_MIN = 0.3;
const DOMAIN_MAX = 5.2;
const WIDTH = 680;
const HEIGHT = 640;
const MARGIN = { top: 24, right: 24, bottom: 56, left: 64 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const TICKS = [1, 2, 3, 4, 5];
const MINOR_TICKS = [0.5, 1.5, 2.5, 3.5, 4.5];

function xScale(v: number) {
  return MARGIN.left + ((v - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * PLOT_W;
}
function yScale(v: number) {
  return MARGIN.top + (1 - (v - DOMAIN_MIN) / (DOMAIN_MAX - DOMAIN_MIN)) * PLOT_H;
}

// Deterministic per-film jitter (not random-per-render) so repeat renders of
// the same data don't make points swim around. Only the x-axis is jittered:
// user ratings are quantised to 0.5 steps and stack heavily; the y-axis
// (TMDB average) is already close to continuous.
function jitterFor(slug: string): number {
  let hash = 0;
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) | 0;
  }
  const unit = ((hash % 1000) + 1000) % 1000 / 1000; // 0..1
  return (unit - 0.5) * 0.26; // +/- 0.13
}

type Band = "cool" | "neutral" | "warm";

function bandFor(delta: number): Band {
  if (delta >= 0.99) return "warm"; // rated it higher than the crowd did
  if (delta <= -0.99) return "cool"; // rated it lower than the crowd did
  return "neutral";
}

const BAND_COLOR: Record<Band, string> = {
  cool: "var(--diverging-cool)",
  neutral: "var(--diverging-neutral)",
  warm: "var(--diverging-warm)",
};

interface HoverState {
  point: RatingPoint;
  x: number;
  y: number;
}

export function ScatterChart({ points }: { points: RatingPoint[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<HoverState | null>(null);

  function showAt(point: RatingPoint, clientX: number, clientY: number) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setHover({ point, x: clientX - rect.left, y: clientY - rect.top });
  }

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full h-auto"
        role="img"
        aria-label="Scatter plot of your Letterboxd ratings versus each film's TMDB average rating"
      >
        {/* gridlines */}
        {TICKS.map((t) => (
          <line
            key={`gy-${t}`}
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}
        {TICKS.map((t) => (
          <line
            key={`gx-${t}`}
            x1={xScale(t)}
            x2={xScale(t)}
            y1={MARGIN.top}
            y2={HEIGHT - MARGIN.bottom}
            stroke="var(--gridline)"
            strokeWidth={1}
          />
        ))}

        {/* minor ticks (axis only, no gridline) */}
        {MINOR_TICKS.map((t) => (
          <line
            key={`mtx-${t}`}
            x1={xScale(t)}
            x2={xScale(t)}
            y1={HEIGHT - MARGIN.bottom}
            y2={HEIGHT - MARGIN.bottom + 5}
            stroke="var(--baseline)"
            strokeWidth={1}
          />
        ))}
        {MINOR_TICKS.map((t) => (
          <line
            key={`mty-${t}`}
            x1={MARGIN.left - 5}
            x2={MARGIN.left}
            y1={yScale(t)}
            y2={yScale(t)}
            stroke="var(--baseline)"
            strokeWidth={1}
          />
        ))}

        {/* axes baseline */}
        <line
          x1={MARGIN.left}
          x2={WIDTH - MARGIN.right}
          y1={HEIGHT - MARGIN.bottom}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--baseline)"
          strokeWidth={1}
        />
        <line
          x1={MARGIN.left}
          x2={MARGIN.left}
          y1={MARGIN.top}
          y2={HEIGHT - MARGIN.bottom}
          stroke="var(--baseline)"
          strokeWidth={1}
        />

        {/* tick labels */}
        {TICKS.map((t) => (
          <text
            key={`tlx-${t}`}
            x={xScale(t)}
            y={HEIGHT - MARGIN.bottom + 20}
            textAnchor="middle"
            fontSize={13}
            fill="var(--text-muted)"
          >
            {t}
          </text>
        ))}
        {TICKS.map((t) => (
          <text
            key={`tly-${t}`}
            x={MARGIN.left - 12}
            y={yScale(t) + 4}
            textAnchor="end"
            fontSize={13}
            fill="var(--text-muted)"
          >
            {t}
          </text>
        ))}

        {/* axis titles */}
        <text
          x={MARGIN.left + PLOT_W / 2}
          y={HEIGHT - 12}
          textAnchor="middle"
          fontSize={14}
          fill="var(--text-secondary)"
        >
          Your rating
        </text>
        <text
          x={-(MARGIN.top + PLOT_H / 2)}
          y={18}
          textAnchor="middle"
          fontSize={14}
          fill="var(--text-secondary)"
          transform="rotate(-90)"
        >
          TMDB average rating
        </text>

        {/* y = x reference line */}
        <line
          x1={xScale(DOMAIN_MIN)}
          y1={yScale(DOMAIN_MIN)}
          x2={xScale(DOMAIN_MAX)}
          y2={yScale(DOMAIN_MAX)}
          stroke="var(--baseline)"
          strokeWidth={1.5}
          strokeDasharray="4 4"
        />
        <text
          x={xScale(DOMAIN_MAX) - 4}
          y={yScale(DOMAIN_MAX) + 14}
          textAnchor="end"
          fontSize={11}
          fill="var(--text-muted)"
        >
          same as average
        </text>

        {/* points */}
        {points.map((p) => {
          const jx = Math.min(DOMAIN_MAX, Math.max(DOMAIN_MIN, p.userRating + jitterFor(p.slug)));
          const cx = xScale(jx);
          const cy = yScale(p.avgRating);
          const color = BAND_COLOR[bandFor(p.userRating - p.avgRating)];
          const isHovered = hover?.point.slug === p.slug;
          return (
            <a
              key={p.slug}
              href={p.link}
              target="_blank"
              rel="noopener noreferrer"
              onMouseMove={(e) => showAt(p, e.clientX, e.clientY)}
              onMouseLeave={() => setHover(null)}
              onFocus={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                showAt(p, r.left + r.width / 2, r.top + r.height / 2);
              }}
              onBlur={() => setHover(null)}
            >
              {/* generous invisible hit target, per interaction guidance */}
              <circle cx={cx} cy={cy} r={14} fill="transparent" />
              <circle
                cx={cx}
                cy={cy}
                r={isHovered ? 7 : 5}
                fill={color}
                stroke={isHovered ? "var(--accent-secondary)" : "var(--surface-1)"}
                strokeWidth={isHovered ? 3 : 2}
                style={{ transition: "r 100ms ease, stroke 100ms ease" }}
              />
            </a>
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 flex gap-3 rounded-lg border p-2 shadow-lg"
          style={{
            left: Math.min(hover.x + 14, (containerRef.current?.clientWidth ?? 0) - 240),
            top: Math.max(hover.y - 60, 0),
            background: "var(--surface-1)",
            borderColor: "var(--accent-primary)",
            maxWidth: 260,
          }}
        >
          {hover.point.posterUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hover.point.posterUrl}
              alt=""
              width={46}
              height={69}
              className="rounded shrink-0 object-cover"
            />
          )}
          <div className="min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
              {hover.point.name}
              {hover.point.year ? ` (${hover.point.year})` : ""}
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--text-primary)" }}>
              <span className="font-semibold">{hover.point.userRating.toFixed(1)}</span>
              <span style={{ color: "var(--text-secondary)" }}> your rating</span>
            </div>
            <div className="text-sm" style={{ color: "var(--text-primary)" }}>
              <span className="font-semibold">{hover.point.avgRating.toFixed(2)}</span>
              <span style={{ color: "var(--text-secondary)" }}>
                {" "}
                TMDB average{hover.point.ratingCount ? ` (${hover.point.ratingCount.toLocaleString()} votes)` : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-x-6 gap-y-2 justify-center mt-3 text-sm" style={{ color: "var(--text-secondary)" }}>
        <LegendKey color={BAND_COLOR.warm} label="You rated it higher than the crowd" />
        <LegendKey color={BAND_COLOR.neutral} label="About the same" />
        <LegendKey color={BAND_COLOR.cool} label="You rated it lower than the crowd" />
      </div>
    </div>
  );
}

function LegendKey({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden style={{ display: "inline-block", width: 16, height: 2, background: color }} />
      {label}
    </span>
  );
}
