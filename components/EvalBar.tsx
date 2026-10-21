"use client";
// Eval bar for post-game review. In the slice it uses material count
// (centipawn approximation); Stockfish WASM replaces it in milestone 2.

export function EvalBar({ cp, mate, label }: { cp: number; mate?: boolean; label?: string }) {
  // cp clamped to ±1000 -> 50/50 fill
  const clamped = mate ? (cp > 0 ? 1000 : -1000) : Math.max(-1000, Math.min(1000, cp));
  const whitePct = 50 + (clamped / 1000) * 50;
  return (
    <div className="flex items-center gap-3">
      <div
        role="img"
        aria-label={`Evaluation: ${mate ? (cp > 0 ? "mate for white" : "mate for black") : `${(cp / 100).toFixed(1)} centipawns`}`}
        className="flex h-36 w-3.5 flex-col justify-end overflow-hidden rounded-pill border border-border"
      >
        <span className="block bg-board-light" style={{ height: `${whitePct}%` }} />
      </div>
      <span className="text-xs text-text-muted">
        {label ?? "Stockfish (material eval in this build)"}
        <br />
        {mate
          ? cp > 0
            ? "White mates"
            : "Black mates"
          : `${cp > 0 ? "+" : ""}${(cp / 100).toFixed(1)} ${cp >= 0 ? "(White)" : "(Black)"}`}
      </span>
    </div>
  );
}
