"use client";
// Move list: numbered SAN pairs, opening header, active ply highlight.

export type Ply = { san: string };

export function MoveList({ moves, activePly }: { moves: Ply[]; activePly?: number }) {
  const rows: { n: number; white?: string; black?: string }[] = [];
  moves.forEach((m, i) => {
    const n = Math.floor(i / 2) + 1;
    if (i % 2 === 0) rows.push({ n, white: m.san });
    else rows[rows.length - 1].black = m.san;
  });
  return (
    <div className="rounded-md border border-border bg-surface p-3">
      {moves.length === 0 ? (
        <p className="py-2 text-center text-sm text-text-muted">No moves yet — game start.</p>
      ) : (
        <ol className="font-mono text-sm leading-6">
          {rows.map((r, ri) => (
            <li key={r.n} className="flex gap-1">
              <span className="w-7 shrink-0 text-text-muted">{r.n}.</span>
              <span
                className={`rounded-sm px-1.5 ${activePly === ri * 2 ? "bg-accent-soft" : ""}`}
              >
                {r.white}
              </span>
              <span
                className={`rounded-sm px-1.5 ${activePly === ri * 2 + 1 ? "bg-accent-soft" : ""}`}
              >
                {r.black ?? ""}
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
