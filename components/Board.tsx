"use client";
// Board: 64 buttons, tap-to-move, legal hints, last-move tint, check highlight.
// Pieces use Unicode glyphs in the slice; the Cburn SVG set ships later.

import { useMemo } from "react";
import type { Square as CSquare } from "chess.js";

const GLYPH: Record<string, string> = {
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
};

export type BoardSquare = {
  square: CSquare;
  piece: { type: string; color: "w" | "b" } | null;
};

export function Board({
  board,
  orientation = "white",
  selected,
  legalTargets,
  lastMove,
  checkSquare,
  onSquare,
}: {
  board: BoardSquare[];
  orientation?: "white" | "black";
  selected?: string | null;
  legalTargets: Set<string>;
  lastMove?: { from: string; to: string } | null;
  checkSquare?: string | null;
  onSquare: (sq: string) => void;
}) {
  const squares = useMemo(
    () => (orientation === "white" ? board : [...board].reverse()),
    [board, orientation]
  );
  return (
    <div
      role="grid"
      aria-label="Chess board"
      className="grid aspect-square w-full grid-cols-8 overflow-hidden rounded-lg shadow-card"
    >
      {squares.map(({ square, piece }) => {
        const isDark = (square.charCodeAt(0) + Number(square[1])) % 2 === 0;
        const isSelected = selected === square;
        const isTarget = legalTargets.has(square);
        const isLast = lastMove && (lastMove.from === square || lastMove.to === square);
        const isCheck = checkSquare === square;
        return (
          <button
            key={square}
            role="gridcell"
            aria-label={`${square}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ", empty"}`}
            onClick={() => onSquare(square)}
            className={`relative grid place-items-center ${isDark ? "bg-board-dark" : "bg-board-light"}
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`}
          >
            {isLast && <span aria-hidden className="absolute inset-0 bg-last-move opacity-45" />}
            {isCheck && (
              <span aria-hidden className="absolute inset-0 bg-check opacity-35" />
            )}
            {isTarget && (
              <span
                aria-hidden
                className={`absolute ${piece ? "inset-1 rounded-full border-4 border-move-hint" : "h-1/4 w-1/4 rounded-full bg-move-hint"}`}
              />
            )}
            {piece && (
              <span
                aria-hidden
                className={`relative z-1 select-none text-[7vmin] leading-none sm:text-[34px] ${
                  piece.color === "w" ? "text-white" : "text-black"
                }`}
                style={{ filter: "drop-shadow(0 1px 1px rgba(0,0,0,.4))" }}
              >
                {GLYPH[piece.type]}
              </span>
            )}
            {isSelected && (
              <span aria-hidden className="absolute inset-0 bg-accent-soft opacity-60" />
            )}
          </button>
        );
      })}
    </div>
  );
}
