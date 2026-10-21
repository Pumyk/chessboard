"use client";
// S05 live game + S06 post-game, slice version: you (white) vs bot (black).
// Clocks run client-side here; the backend makes them server-authoritative.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess, type Move, type Square as CSquare } from "chess.js";
import { Board, type BoardSquare } from "@/components/Board";
import { PlayerBanner } from "@/components/PlayerBanner";
import { MoveList } from "@/components/MoveList";
import { EvalBar } from "@/components/EvalBar";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { botMove, materialEval } from "@/lib/bot";
import { createBotGame, getMe, type GameSnapshot } from "@/lib/datalayer";

type Phase = "active" | "finished";

function resultText(chess: Chess, timeoutSide: "w" | "b" | null): { result: string; reason: string } {
  if (chess.isCheckmate())
    return {
      result: chess.turn() === "w" ? "0-1 · Black wins" : "1-0 · White wins",
      reason: "Checkmate",
    };
  if (timeoutSide)
    return {
      result: timeoutSide === "w" ? "0-1 · Black wins" : "1-0 · White wins",
      reason: "White ran out of time",
    };
  if (chess.isStalemate()) return { result: "1/2-1/2 · Draw", reason: "Stalemate" };
  if (chess.isInsufficientMaterial())
    return { result: "1/2-1/2 · Draw", reason: "Not enough material to mate" };
  if (chess.isThreefoldRepetition())
    return { result: "1/2-1/2 · Draw", reason: "Threefold repetition" };
  if (chess.isDraw()) return { result: "1/2-1/2 · Draw", reason: "Fifty-move rule" };
  return { result: "*", reason: "" };
}

function PlayInner() {
  const params = useSearchParams();
  const me = getMe();
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const chess = useMemo(() => new Chess(), []);
  const [fen, setFen] = useState(chess.fen());
  const [phase, setPhase] = useState<Phase>("active");
  const [outcome, setOutcome] = useState<{ result: string; reason: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [whiteMs, setWhiteMs] = useState(600000);
  const [blackMs, setBlackMs] = useState(600000);
  const [resignOpen, setResignOpen] = useState(false);
  const [drawAsked, setDrawAsked] = useState(false);
  const [tab, setTab] = useState<"moves" | "analysis">("moves");
  const [, forceRender] = useState(0);
  const overRef = useRef(false);

  const tc = params.get("tc") ?? "600+0";
  const [baseSec, incSec] = tc.split("+").map(Number);

  useEffect(() => {
    setWhiteMs((baseSec || 600) * 1000);
    setBlackMs((baseSec || 600) * 1000);
    createBotGame(baseSec || 600, incSec || 0).then(setGame);
  }, [baseSec, incSec]);

  const finish = useCallback(
    (timeoutSide: "w" | "b" | null = null, resignationBy: "w" | "b" | null = null) => {
      if (overRef.current) return;
      overRef.current = true;
      if (resignationBy) {
        setOutcome({
          result: resignationBy === "w" ? "0-1 · Black wins" : "1-0 · White wins",
          reason: "Resignation",
        });
      } else {
        setOutcome(resultText(chess, timeoutSide));
      }
      setPhase("finished");
      setSelected(null);
    },
    [chess]
  );

  // clocks
  useEffect(() => {
    if (phase !== "active") return;
    const id = setInterval(() => {
      const now = Date.now();
      setWhiteMs((ms) => {
        if (chess.turn() === "w") {
          const next = ms - (now - last);
          if (next <= 0) return (finish("w"), 0);
          return next;
        }
        return ms;
      });
      setBlackMs((ms) => {
        if (chess.turn() === "b") {
          const next = ms - (now - last);
          if (next <= 0) return (finish("b"), 0);
          return next;
        }
        return ms;
      });
      last = now;
    }, 100);
    let last = Date.now();
    return () => clearInterval(id);
  }, [phase, chess, finish]);

  // board state
  const board: BoardSquare[] = useMemo(() => {
    const out: BoardSquare[] = [];
    chess.board().forEach((row, r) =>
      row.forEach((sq, c) => {
        const name = ("abcdefgh"[c] + (8 - r)) as CSquare;
        out.push({ square: sq ? (sq.square as CSquare) : name, piece: sq });
      })
    );
    return out;
  }, [fen, chess]); // eslint-disable-line react-hooks/exhaustive-deps

  const legalTargets = useMemo(() => {
    if (!selected) return new Set<string>();
    return new Set(
      (chess.moves({ square: selected as CSquare, verbose: true }) as Move[]).map((m) => m.to)
    );
  }, [selected, fen, chess]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    for (const row of chess.board())
      for (const sq of row)
        if (sq && sq.type === "k" && sq.color === chess.turn()) return sq.square;
    return null;
  }, [fen, chess]); // eslint-disable-line react-hooks/exhaustive-deps

  function tryMove(from: string, to: string) {
    const legal = (chess.moves({ square: from as CSquare, verbose: true }) as Move[]).find(
      (m) => m.to === to
    );
    if (!legal) return false;
    chess.move({ from, to, promotion: "q" }); // auto-queen in the slice; picker ships later
    applyClockIncrement();
    setLastMove({ from, to });
    setSelected(null);
    setFen(chess.fen());
    if (chess.isGameOver()) finish();
    else setTimeout(botTurn, 350);
    return true;
  }

  function applyClockIncrement() {
    const inc = (incSec || 0) * 1000;
    if (chess.turn() === "w") setWhiteMs((ms) => ms + inc);
    else setBlackMs((ms) => ms + inc);
  }

  function botTurn() {
    const m = botMove(chess.fen());
    if (!m) {
      finish();
      return;
    }
    chess.move(m);
    applyClockIncrement();
    setLastMove({ from: m.from, to: m.to });
    setFen(chess.fen());
    if (chess.isGameOver()) finish();
  }

  function onSquare(sq: string) {
    if (phase !== "active" || chess.turn() !== "w") return;
    if (selected && tryMove(selected, sq)) return;
    const piece = chess.get(sq as CSquare);
    if (piece && piece.color === "w") setSelected(sq);
    else setSelected(null);
  }

  const history = chess.history({ verbose: true }) as Move[];
  const myTurn = phase === "active" && chess.turn() === "w";
  const lowTime = (ms: number) => ms < 10000 && phase === "active";

  if (!game)
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-sm text-text-muted">Preparing board…</p>
      </main>
    );

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">
      <PlayerBanner
        name={game.black.name}
        rating={game.black.rating}
        avatar="B"
        clockMs={blackMs}
        active={phase === "active" && chess.turn() === "b"}
        low={lowTime(blackMs)}
      />

      <Board
        board={board}
        selected={selected}
        legalTargets={legalTargets}
        lastMove={lastMove}
        checkSquare={checkSquare}
        onSquare={onSquare}
      />

      <PlayerBanner
        name="You"
        rating={me.rating}
        avatar="YU"
        clockMs={whiteMs}
        active={phase === "active" && chess.turn() === "w"}
        low={lowTime(whiteMs)}
      />

      <p className="text-center text-sm text-text-muted" aria-live="polite">
        {phase === "finished"
          ? `${outcome?.result} — ${outcome?.reason}`
          : myTurn
            ? "Your move"
            : "Bot is thinking…"}
      </p>

      {phase === "active" ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={() => setDrawAsked(true)}>
            ½ Draw
          </Button>
          <Button variant="secondary" className="flex-1" onClick={() => setResignOpen(true)}>
            ⚑ Resign
          </Button>
        </div>
      ) : (
        <Button onClick={() => window.location.reload()} className="w-full">
          New game
        </Button>
      )}

      <div role="tablist" aria-label="Game panels" className="mt-1 flex gap-3 border-b border-border text-sm">
        {(["moves", "analysis"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-none pb-2 pt-1 ${
              tab === t ? "border-b-2 border-accent text-text" : "text-text-muted"
            }`}
          >
            {t === "moves" ? "Moves" : "Analysis"}
          </button>
        ))}
      </div>

      {tab === "moves" ? (
        <MoveList moves={history.map((m) => ({ san: m.san }))} />
      ) : (
        <EvalBar cp={materialEval(chess)} />
      )}

      <Dialog
        open={resignOpen}
        danger
        title="Resign this game?"
        body="Resigning counts as a loss. The bot gets the point."
        confirmLabel="Resign"
        onCancel={() => setResignOpen(false)}
        onConfirm={() => {
          setResignOpen(false);
          finish(null, "w");
        }}
      />

      {drawAsked && phase === "active" && (
        <p role="status" className="rounded-md border border-border bg-surface p-3 text-center text-sm text-text-muted">
          You offered a draw. The bot declined — play on!
        </p>
      )}
    </main>
  );
}

export default function Play() {
  return (
    <Suspense fallback={<p className="p-4 text-sm text-text-muted">Loading…</p>}>
      <PlayInner />
    </Suspense>
  );
}
