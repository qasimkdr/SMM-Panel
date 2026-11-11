"use client";

import { useEffect, useId, useMemo, useRef, useState, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Lightweight inline-SVG charts following the dataviz rules:
 * one y-axis, 2px lines, recessive grid, crosshair + tooltip on lines, per-bar tooltips,
 * legend for ≥2 series plus direct end labels, values in text tokens (never series color),
 * and a table view so nothing is color- or hover-only.
 * Series colors are validated (light/dark, CVD) — see docs/DESIGN_SYSTEM.md.
 * Charts render at their real pixel width so text never scales with the viewBox.
 */
export interface Series {
  key: string;
  label: string;
  color: string; // CSS var, e.g. var(--viz-1)
}

const PAD = { top: 16, right: 76, bottom: 28, left: 52 };

/** Round axis: N steps of 1/2/5×10ⁿ, so labels read $0, $1, $2… not $1.3, $3.8. */
function niceScale(v: number, steps = 4) {
  if (v <= 0) return { max: steps, step: 1 };
  const raw = v / steps;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  const step = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  return { max: step * steps, step };
}

/** Measures the container (which never takes its size from the chart), so the SVG can't force overflow. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(240, Math.round(e!.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

/** Evenly spaced x labels; drops the one just before the last so they never collide. */
const showLabel = (i: number, last: number, every: number) => i === last || (i % every === 0 && last - i >= every * 0.6);

const shortDay = (iso: string) => new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function LineChart({
  data,
  series,
  height = 240,
  format,
  title,
}: {
  data: Record<string, number | string>[];
  series: Series[];
  height?: number;
  format: (v: number) => string;
  title: string;
}) {
  const id = useId();
  const svg = useRef<SVGSVGElement>(null);
  const [box, W] = useWidth<HTMLElement>();
  const [hover, setHover] = useState<number | null>(null);
  const innerW = W - PAD.left - PAD.right;
  const innerH = height - PAD.top - PAD.bottom;
  const { step } = useMemo(() => niceScale(Math.max(0, ...data.flatMap((d) => series.map((s) => Number(d[s.key]) || 0)))), [data, series]);
  const max = step * 4;
  const x = (i: number) => PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => PAD.top + innerH - (Math.max(0, v) / max) * innerH;
  const ticks = [0, 1, 2, 3, 4].map((i) => i * step);
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 90))));

  const onMove = (e: PointerEvent<SVGSVGElement>) => {
    const r = svg.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - PAD.left) / innerW) * (data.length - 1));
    setHover(Math.max(0, Math.min(data.length - 1, i)));
  };

  const last = data.length - 1;
  // Keep the two end labels from overlapping.
  const ends = series.map((s) => ({ s, y: y(Number(data[last]?.[s.key]) || 0) })).sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) if (ends[i]!.y - ends[i - 1]!.y < 14) ends[i]!.y = ends[i - 1]!.y + 14;

  return (
    <figure ref={box} className="relative w-full min-w-0">
      <figcaption className="sr-only">{title}</figcaption>
      <div className="mb-3 flex flex-wrap gap-4" aria-hidden>
        {series.map((s) => (
          <span key={s.key} className="flex items-center gap-2 text-[13px] text-ink-2">
            <span className="h-0.5 w-4 rounded-full" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${height}`}
        width={W || 1}
        height={height}
        style={{ visibility: W ? "visible" : "hidden" }}
        className="block touch-none select-none overflow-visible"
        role="img"
        aria-labelledby={`${id}-t`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <title id={`${id}-t`}>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
            <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} className="fill-ink-3" style={{ fontVariantNumeric: "tabular-nums" }}>
              {format(t)}
            </text>
          </g>
        ))}
        {data.map((d, i) =>
          showLabel(i, last, labelEvery) ? (
            <text key={i} x={x(i)} y={height - 8} fontSize={11} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-ink-3">
              {shortDay(String(d.day))}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <path
            key={s.key}
            d={data.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(Number(d[s.key]) || 0).toFixed(1)}`).join("")}
            fill="none"
            stroke={s.color}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {/* direct end labels — text in ink, a small colored dot carries identity */}
        {ends.map(({ s, y: ly }) => (
          <g key={s.key}>
            <circle cx={x(last)} cy={y(Number(data[last]?.[s.key]) || 0)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            <text x={x(last) + 10} y={ly} dy="0.32em" fontSize={12} fontWeight={500} className="fill-ink-2">
              {s.label}
            </text>
          </g>
        ))}
        {hover !== null && (
          <g pointerEvents="none">
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + innerH} stroke="var(--ink-3)" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.key} cx={x(hover)} cy={y(Number(data[hover]?.[s.key]) || 0)} r={5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />
            ))}
          </g>
        )}
      </svg>
      {hover !== null && data[hover] && (
        <div
          className="pointer-events-none absolute top-8 z-10 min-w-[150px] rounded-xl border border-line bg-surface px-3 py-2.5 shadow-3"
          style={{ left: x(hover), transform: `translateX(${x(hover) > W * 0.6 ? "calc(-100% - 12px)" : "12px"})` }}
          role="status"
        >
          <p className="text-[12px] text-ink-3">{shortDay(String(data[hover].day))}</p>
          {series.map((s) => (
            <p key={s.key} className="mt-1 flex items-center justify-between gap-4 text-[13px]">
              <span className="flex items-center gap-2 text-ink-2">
                <span className="h-0.5 w-3 rounded-full" style={{ background: s.color }} />
                {s.label}
              </span>
              <strong className="tabular font-semibold text-ink">{format(Number(data[hover][s.key]) || 0)}</strong>
            </p>
          ))}
        </div>
      )}
    </figure>
  );
}

export function BarChart({
  data,
  valueKey,
  label,
  height = 200,
  color = "var(--viz-1)",
}: {
  data: Record<string, number | string>[];
  valueKey: string;
  label: string;
  height?: number;
  color?: string;
}) {
  const id = useId();
  const [box, W] = useWidth<HTMLElement>();
  const [hover, setHover] = useState<number | null>(null);
  const left = 36;
  const innerW = W - left - 8;
  const innerH = height - PAD.top - PAD.bottom;
  const { max, step } = niceScale(Math.max(0, ...data.map((d) => Number(d[valueKey]) || 0)), 2);
  const slot = innerW / Math.max(1, data.length);
  const bw = Math.max(2, slot - 2); // 2px surface gap between bars
  const y = (v: number) => PAD.top + innerH - (v / max) * innerH;
  const last = data.length - 1;
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(innerW / 80))));

  return (
    <figure ref={box} className="relative w-full min-w-0">
      <figcaption className="sr-only">{label}</figcaption>
      {W > 0 && <svg viewBox={`0 0 ${W} ${height}`} width={W} height={height} className="block select-none overflow-visible" role="img" aria-labelledby={`${id}-t`} onPointerLeave={() => setHover(null)}>
        <title id={`${id}-t`}>{label}</title>
        {[0, 1, 2].map((i) => (
          <g key={i}>
            <line x1={left} x2={W - 8} y1={y(i * step)} y2={y(i * step)} stroke="var(--line)" strokeDasharray={i === 0 ? undefined : "3 4"} />
            <text x={left - 8} y={y(i * step)} dy="0.32em" textAnchor="end" fontSize={11} className="fill-ink-3">
              {(i * step).toLocaleString()}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const v = Number(d[valueKey]) || 0;
          const h = Math.max(0, PAD.top + innerH - y(v));
          const bx = left + i * slot + 1;
          const base = PAD.top + innerH;
          const r = Math.min(4, bw / 2, h);
          // rounded data-end (top), square at the baseline
          const path = h > 0 ? `M${bx},${base}V${base - h + r}Q${bx},${base - h} ${bx + r},${base - h}H${bx + bw - r}Q${bx + bw},${base - h} ${bx + bw},${base - h + r}V${base}Z` : "";
          return (
            <g key={i}>
              {path && <path d={path} fill={color} opacity={hover === null || hover === i ? 1 : 0.45} style={{ transition: "opacity 150ms" }} />}
              {/* hit target is the full column, larger than the mark */}
              <rect x={left + i * slot} y={PAD.top} width={slot} height={innerH} fill="transparent" onPointerEnter={() => setHover(i)} />
            </g>
          );
        })}
        {data.map((d, i) =>
          showLabel(i, last, labelEvery) ? (
            <text key={i} x={left + i * slot + slot / 2} y={height - 8} fontSize={11} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} className="fill-ink-3">
              {shortDay(String(d.day))}
            </text>
          ) : null,
        )}
      </svg>}
      {W === 0 && <div style={{ height }} aria-hidden />}
      {hover !== null && data[hover] && (
        <div className="pointer-events-none absolute top-0 z-10 rounded-xl border border-line bg-surface px-3 py-2 shadow-3" style={{ left: left + hover * slot + slot / 2, transform: "translateX(-50%)" }} role="status">
          <p className="text-[12px] text-ink-3">{shortDay(String(data[hover].day))}</p>
          <p className="tabular text-[14px] font-semibold">
            {Number(data[hover][valueKey]).toLocaleString()} <span className="font-normal text-ink-2">{label.toLowerCase()}</span>
          </p>
        </div>
      )}
    </figure>
  );
}

/** Accessible table alternative for any chart. */
export function ChartTable({ data, columns }: { data: Record<string, number | string>[]; columns: { key: string; label: string; format?: (v: number) => string }[] }) {
  return (
    <div className="max-h-72 overflow-auto rounded-xl border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="sticky top-0 bg-surface-2 text-ink-3">
          <tr>
            <th className="px-3 py-2 font-medium">Day</th>
            {columns.map((c) => (
              <th key={c.key} className="px-3 py-2 text-right font-medium">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...data].reverse().map((d) => (
            <tr key={String(d.day)} className="border-t border-line">
              <td className="px-3 py-1.5">{shortDay(String(d.day))}</td>
              {columns.map((c) => (
                <td key={c.key} className={cn("tabular px-3 py-1.5 text-right font-mono")}>
                  {c.format ? c.format(Number(d[c.key]) || 0) : String(d[c.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
