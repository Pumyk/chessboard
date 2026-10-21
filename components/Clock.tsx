"use client";
// Clock: server-authoritative in the real backend; the slice interpolates
// locally from the same fields the API will return (ms remaining + turn start).

export function Clock({ ms, active, low }: { ms: number; active: boolean; low?: boolean }) {
  const total = Math.max(0, ms);
  const m = Math.floor(total / 60000);
  const s = Math.floor((total % 60000) / 1000);
  const tenths = total < 20000;
  const label = tenths
    ? `${m}:${String(s).padStart(2, "0")}.${Math.floor((total % 1000) / 100)}`
    : `${m}:${String(s).padStart(2, "0")}`;
  return (
    <span
      aria-live="off"
      className={`font-mono text-lg font-bold tabular-nums ${
        low ? "text-danger animate-pulse" : active ? "text-text" : "text-text-muted"
      }`}
    >
      {total === 0 ? "—" : label}
    </span>
  );
}
