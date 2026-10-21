"use client";

import { Clock } from "./Clock";

export function PlayerBanner({
  name,
  rating,
  avatar,
  clockMs,
  active,
  low,
  showClock = true,
}: {
  name: string;
  rating?: number | null;
  avatar: string;
  clockMs?: number;
  active?: boolean;
  low?: boolean;
  showClock?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 ${
        active ? "shadow-[inset_3px_0_0_var(--color-accent-strong)]" : ""
      }`}
    >
      <span
        aria-hidden
        className={`grid size-8 shrink-0 place-items-center rounded-pill bg-accent-soft text-xs font-semibold text-text-muted ${
          active ? "ring-2 ring-accent-strong" : ""
        }`}
      >
        {avatar}
      </span>
      <b className="truncate text-sm">{name}</b>
      {rating != null && <span className="shrink-0 text-xs text-text-muted">({rating})</span>}
      {showClock && clockMs != null && (
        <span className="ml-auto">
          <Clock ms={clockMs} active={!!active} low={low} />
        </span>
      )}
    </div>
  );
}
