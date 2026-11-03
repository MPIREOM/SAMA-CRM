"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

// Small, dependency-free chart pieces for the Analytics page. One series per
// chart in the brand maroon (magnitude, single hue), recessive tracks, values
// always printed in text ink beside the mark, and a hover tooltip per mark.

export function Section({ title, hint, children, actions }: { title: string; hint?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold text-maroon-900">{title}</h2>
          {hint && <p className="text-xs text-maroon-400">{hint}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** A titled card; `flush` lets a table run edge to edge (scrolling sideways on small screens). */
export function Panel({ title, children, className, flush }: { title?: string; children: ReactNode; className?: string; flush?: boolean }) {
  return (
    <Card className={cn("p-4", className)}>
      {title && <h3 className="mb-3 text-xs font-bold uppercase tracking-wide text-maroon-500">{title}</h3>}
      {flush ? <div className="-mx-4 -mb-4 overflow-x-auto">{children}</div> : children}
    </Card>
  );
}

export function StatTile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs font-semibold text-maroon-400">{label}</p>
      <p className={cn("mt-0.5 font-extrabold leading-tight text-maroon-900 tabular-nums", value.length > 9 ? "text-lg" : "text-2xl")}>{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-maroon-400">{sub}</p>}
    </Card>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{children}</div>;
}

/** Vertical bars over time (one series). Tooltip shows the date label and value. */
export function ColumnChart({
  points,
  format = (v) => String(v),
  ariaLabel,
}: {
  points: { label: string; short: string; value: number }[];
  format?: (v: number) => string;
  ariaLabel: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const every = Math.max(1, Math.ceil(points.length / 10)); // ≤ ~10 axis labels
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-maroon-400">
        <span className="tabular-nums">{format(max)}</span>
      </div>
      <div role="img" aria-label={ariaLabel} className="relative flex h-40 items-end gap-[2px] border-b border-maroon-100">
        <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-maroon-100" />
        {points.map((p) => (
          <div key={p.label} className="group relative flex h-full flex-1 items-end">
            <div
              className="w-full rounded-t-[4px] bg-maroon-700 transition-colors group-hover:bg-gold-600"
              style={{ height: `${(p.value / max) * 100}%`, minHeight: p.value > 0 ? 2 : 0 }}
            />
            <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-md bg-maroon-900 px-2 py-1 text-[11px] font-semibold text-white shadow group-hover:block">
              {p.label}: {format(p.value)}
            </div>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-[2px] text-[10px] text-maroon-400">
        {points.map((p, i) => (
          <div key={p.label} className="flex-1 truncate text-center">
            {i % every === 0 ? p.short : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Ranked horizontal bars with the value (and optional share) printed beside each. */
export function BarList({
  rows,
  format = (v) => String(v),
  total,
  empty,
}: {
  rows: { key: string; label: string; value: number; extra?: string }[];
  format?: (v: number) => string;
  total?: number;
  empty: string;
}) {
  if (rows.length === 0 || rows.every((r) => r.value === 0)) return <p className="py-4 text-center text-xs text-maroon-400">{empty}</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-1.5">
      {rows.map((r) => (
        <li key={r.key} className="group" title={`${r.label}: ${format(r.value)}${total ? ` (${pct(r.value / total)})` : ""}`}>
          <div className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 truncate font-semibold text-maroon-800">{r.label}</span>
            <span className="shrink-0 tabular-nums text-maroon-600">
              {format(r.value)}
              {total ? <span className="ms-1 text-maroon-400">{pct(r.value / total)}</span> : null}
              {r.extra ? <span className="ms-1 text-maroon-400">{r.extra}</span> : null}
            </span>
          </div>
          <div className="mt-0.5 h-1.5 rounded-full bg-maroon-50">
            <div className="h-1.5 rounded-full bg-maroon-700 transition-colors group-hover:bg-gold-600" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function pct(v: number, digits = 0): string {
  if (!Number.isFinite(v)) return "—";
  return `${(v * 100).toFixed(digits)}%`;
}
