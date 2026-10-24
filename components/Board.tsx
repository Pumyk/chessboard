"use client";
// Board: 64 buttons, tap-to-move, legal hints, last-move tint, check highlight.
// Pieces use Unicode glyphs in the slice; the Cburn SVG set ships later.

import { useMemo } from "react";
import type { Square as CSquare } from "chess.js";

const LETTER: Record<string, string> = { p: "P", n: "N", b: "B", r: "R", q: "Q", k: "K" };

export const GLYPH: Record<string, string> = {
  p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚",
};

export type BoardSquare = {
  square: CSquare;
  piece: { type: string; color: "w" | "b" } | null;
};

export function Board({
  pieceSet,
  theme,
  showCoords = true,
  board,
  orientation = "white",
  selected,
  legalTargets,
  lastMove,
  checkSquare,
  onSquare,
}: {
  pieceSet?: "classic" | "letters";
  theme?: { light: string; dark: string };
  showCoords?: boolean;
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
      className="grid aspect-square w-full grid-cols-8 grid-rows-8 overflow-hidden rounded-lg shadow-card"
    >
      {squares.map(({ square, piece }, i) => {
        const row = Math.floor(i / 8);
        const col = i % 8;
        const isBottom = row === 7;
        const isLeft = col === 0;
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
            style={{ backgroundColor: isDark ? (theme?.dark ?? "#769656") : (theme?.light ?? "#eeeed2") }}
            className={`relative grid place-items-center
              focus-visible:outline-2 focus-visible:outline-accent focus-visible:-outline-offset-2`}
          >
            {showCoords !== false && isLeft && (
              <span aria-hidden className="absolute left-0.5 top-0.5 text-[10px] font-semibold leading-none opacity-60">
                {square[1]}
              </span>
            )}
            {showCoords !== false && isBottom && (
              <span aria-hidden className="absolute bottom-0.5 right-1 text-[10px] font-semibold leading-none opacity-60">
                {square[0]}
              </span>
            )}
            {isLast && <span aria-hidden className="absolute inset-0 bg-last-move opacity-45" />}
            {isCheck && (
              <span aria-hidden className="absolute inset-0 bg-check opacity-35" />
            )}
            {isTarget && (
              <span
                aria-hidden
                className={
                  piece
                    ? "absolute inset-[6%] rounded-full border-[0.3rem] border-move-hint bg-transparent"
                    : "absolute left-1/2 top-1/2 h-[28%] w-[28%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-move-hint"
                }
              />
            )}
            {piece && (
              <span
                aria-hidden
                className={`relative z-1 select-none text-[7vmin] leading-none sm:text-[34px] ${
                  pieceSet === "letters" ? "font-bold" : ""
                }`}
                style={
                  pieceSet === "letters"
                    ? {
                        color: piece.color === "w" ? "#FAFBFD" : "#15171F",
                        textShadow: "0 1px 1px rgba(0,0,0,.45)",
                      }
                    : {
                        // filled glyphs for both colors + contrasting outline =
                        // crisp, readable pieces on any board theme
                        color: piece.color === "w" ? "#F7F8FA" : "#191B24",
                        WebkitTextStroke: piece.color === "w" ? "1.2px #12141C" : "1.2px rgba(238,242,250,.6)",
                      }
                }
              >
                {pieceSet === "letters" ? LETTER[piece.type] : GLYPH[piece.type]}
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
