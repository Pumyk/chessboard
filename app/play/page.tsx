"use client";
// S05 live game + S06 post-game. Handles both bot games and quick-paired
// human games: my-color board, opponent-move polling, draw offers, abort
// before the first move, resign, and server-authoritative results.

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Chess, type Move, type Square as CSquare } from "chess.js";
import { Board, GLYPH, type BoardSquare } from "@/components/Board";
import { PlayerBanner } from "@/components/PlayerBanner";
import { MoveList } from "@/components/MoveList";
import { openingName } from "@/lib/openings";
import { EvalBar } from "@/components/EvalBar";
import { Dialog } from "@/components/Dialog";
import { Button } from "@/components/Button";
import { materialEval } from "@/lib/bot";
import {
  abortGame, bootstrap, claimTimeout, createBotGame, getMe, loadChat, loadGame, offerDraw,
  resignGame, respondDraw, sendChat, serverBotMove, submitMove,
  type GameSnapshot, type Player,
} from "@/lib/datalayer";
import { sounds } from "@/lib/sounds";

type Phase = "active" | "finished";

const END_REASON_LABEL: Record<string, string> = {
  checkmate: "Checkmate",
  resignation: "Resignation",
  timeout: "Time out",
  draw_agreement: "Draw by agreement",
  aborted: "Aborted",
  stalemate: "Stalemate",
  repetition: "Threefold repetition",
  insufficient_material: "Not enough material",
  fifty_move: "Fifty-move rule",
};

function serverResultText(result: string, reason: string | null): string {
  if (result === "*") return "Game aborted";
  const why = reason ? ` — ${END_REASON_LABEL[reason] ?? reason}` : "";
  if (result === "1-0") return `1-0 · White wins${why}`;
  if (result === "0-1") return `0-1 · Black wins${why}`;
  if (result === "1/2-1/2") return `1/2-1/2 · Draw${why}`;
  return why.startsWith(" — ") ? why.slice(3) : (reason ?? "");
}

function localResultText(chess: Chess, timeoutSide: "w" | "b" | null): { result: string; reason: string } {
  if (chess.isCheckmate())
    return { result: chess.turn() === "w" ? "0-1 · Black wins" : "1-0 · White wins", reason: "Checkmate" };
  if (timeoutSide)
    return {
      result: timeoutSide === "w" ? "0-1 · Black wins" : "1-0 · White wins",
      reason: timeoutSide === "w" ? "White ran out of time" : "Black ran out of time",
    };
  if (chess.isStalemate()) return { result: "1/2-1/2 · Draw", reason: "Stalemate" };
  if (chess.isInsufficientMaterial()) return { result: "1/2-1/2 · Draw", reason: "Not enough material" };
  if (chess.isThreefoldRepetition()) return { result: "1/2-1/2 · Draw", reason: "Threefold repetition" };
  if (chess.isDraw()) return { result: "1/2-1/2 · Draw", reason: "Fifty-move rule" };
  return { result: "*", reason: "" };
}

function PlayInner() {
  const params = useSearchParams();
  const me = getMe();
  const chess = useMemo(() => new Chess(), []);
  const [game, setGame] = useState<GameSnapshot | null>(null);
  const [human, setHuman] = useState(false);
  const [myColor, setMyColor] = useState<"w" | "b">("w");
  const [opponent, setOpponent] = useState<Player>({ id: "op", name: "Opponent", avatar: "OP", rating: null });
  const [fen, setFen] = useState(chess.fen());
  const [phase, setPhase] = useState<Phase>("active");
  const [outcome, setOutcome] = useState<{ result: string; reason: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [pendingPromo, setPendingPromo] = useState<{ from: string; to: string } | null>(null);
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null);
  const [whiteMs, setWhiteMs] = useState(600000);
  const [blackMs, setBlackMs] = useState(600000);
  const [resignOpen, setResignOpen] = useState(false);
  const [abortOpen, setAbortOpen] = useState(false);
  const [drawOffered, setDrawOffered] = useState(false); // I offered
  const [incomingDraw, setIncomingDraw] = useState(false); // opponent offered me
  const [tab, setTab] = useState<"moves" | "analysis" | "chat">("moves");
  const [flipped, setFlipped] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null); // null = live
  const [chat, setChat] = useState<{ body: string; username: string }[]>([]);
  const [chatDraft, setChatDraft] = useState("");
  const [lowBeeped, setLowBeeped] = useState<"w" | "b" | null>(null);
  const [copied, setCopied] = useState(false);
  const appliedPly = useRef(0);
  const overRef = useRef(false);

  const tc = params.get("tc") ?? "600+0";
  const [baseSec, incSec] = tc.split("+").map(Number);
  const gameId = params.get("g");

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
        setOutcome(localResultText(chess, timeoutSide));
      }
      setPhase("finished");
      setSelected(null);
      setViewPly(null);
      sounds.gameEnd();
    },
    [chess]
  );

  const finishFromServer = useCallback((result: string, reason: string | null) => {
    overRef.current = true;
    setOutcome({ result: serverResultText(result, reason), reason: reason ?? "" });
    setPhase("finished");
    setSelected(null);
    setViewPly(null);
    sounds.gameEnd();
  }, []);

  const syncServerClocks = useCallback((clocks: { w: number; b: number }) => {
    setWhiteMs(clocks.w);
    setBlackMs(clocks.b);
  }, []);

  // Replay any server moves we haven't applied yet (opponent's moves arrive
  // by polling; ours were already applied optimistically).
  const applyServerMoves = useCallback(
    (moves: { ply: number; san: string }[]) => {
      for (const m of moves) {
        if (m.ply <= appliedPly.current) continue;
        try {
          chess.move(m.san);
          const hist = chess.history({ verbose: true }) as Move[];
          const last = hist[hist.length - 1];
          setLastMove({ from: last.from, to: last.to });
          appliedPly.current = m.ply;
          last.captured ? sounds.capture() : sounds.move();
          if (chess.inCheck()) sounds.check();
        } catch {
          break; // desync: stop, next poll re-fetches
        }
      }
      setFen(chess.fen());
    },
    [chess]
  );

  // Bootstrap: an explicit game id means a real game (human or bot, from the
  // server); no id is the legacy bot-game flow.
  useEffect(() => {
    let alive = true;
    async function boot() {
      if (!gameId) {
        const g = await createBotGame(baseSec || 600, incSec || 0);
        if (!alive) return;
        setGame(g);
        setHuman(false);
        setMyColor("w");
        setOpponent(g.black);
        setWhiteMs((baseSec || 600) * 1000);
        setBlackMs((baseSec || 600) * 1000);
        return;
      }
      const s = await loadGame(gameId).catch(() => null);
      if (!alive || !s) return;
      const g = s.game;
      const isBot = g.type === "bot";
      const who = me.id !== "me" ? me : await bootstrap(); // getMe() fallback until session loads
      const color = g.white_id === who.id ? "w" : "b";
      const otherId = color === "w" ? g.black_id : g.white_id;
      const other = s.players.find((p) => p.id === otherId);
      setHuman(!isBot);
      setMyColor(color);
      setOpponent({
        id: otherId,
        name: isBot ? "Bot" : other?.username ?? "Opponent",
        avatar: (other?.username ?? "OP").slice(0, 2).toUpperCase(),
        rating: null,
      });
      setGame({
        id: g.id, white: who, black: opponent, timeControlSeconds: g.time_control_seconds,
        incrementSeconds: g.increment_seconds, category: g.category as GameSnapshot["category"],
        type: g.type as GameSnapshot["type"], rated: g.rated,
      });
      syncServerClocks(s.clocks);
      applyServerMoves(s.moves);
      if (g.status === "finished") finishFromServer(g.result, g.end_reason);
    }
    void boot();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, baseSec, incSec]);

  // Poll human games for opponent moves, draw offers and results.
  useEffect(() => {
    if (!human || !gameId || phase === "finished") return;
    const id = setInterval(async () => {
      const s = await loadGame(gameId).catch(() => null);
      if (!s) return;
      const g = s.game;
      syncServerClocks(s.clocks);
      applyServerMoves(s.moves);
      setIncomingDraw(g.draw_offer_by !== null && g.draw_offer_by !== me.id);
      setDrawOffered(g.draw_offer_by === me.id);
      if (g.status === "finished") finishFromServer(g.result, g.end_reason);
    }, 1500);
    const chatId = setInterval(async () => {
      const msgs = await loadChat(gameId).catch(() => null);
      if (msgs) setChat(msgs.map(({ body, username }) => ({ body, username })));
    }, 3000);
    return () => { clearInterval(id); clearInterval(chatId); };
  }, [human, gameId, phase, syncServerClocks, applyServerMoves, finishFromServer, me.id]);

  // clocks tick locally between server syncs
  useEffect(() => {
    if (phase !== "active" || !game) return;
    const id = setInterval(() => {
      const now = Date.now();
      setWhiteMs((ms) => {
        if (chess.turn() === "w") {
          const next = ms - (now - last);
          if (next <= 0) return (flag("w"), 0);
          return next;
        }
        return ms;
      });
      setBlackMs((ms) => {
        if (chess.turn() === "b") {
          const next = ms - (now - last);
          if (next <= 0) return (flag("b"), 0);
          return next;
        }
        return ms;
      });
      last = now;
    }, 100);
    let last = Date.now();
    function flag(side: "w" | "b") {
      if (gameId && human) void claimTimeout(gameId);
      finish(side);
    }
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, chess, finish, human, gameId]);

  // warn once per side when a clock crosses under 10 seconds
  useEffect(() => {
    if (phase !== "active") return;
    for (const side of ["w", "b"] as const) {
      const ms = side === "w" ? whiteMs : blackMs;
      if (ms < 10000 && lowBeeped !== side) {
        setLowBeeped(side);
        sounds.lowTime();
      }
    }
  }, [whiteMs, blackMs, phase, lowBeeped]);

  // browsing history: replay the live game up to viewPly in a scratch board
  const history = chess.history({ verbose: true }) as Move[];
  const viewChess = useMemo(() => {
    if (viewPly === null || viewPly >= history.length) return chess;
    const replay = new Chess();
    for (let i = 0; i < viewPly; i++) replay.move(history[i].san);
    return replay;
  }, [viewPly, fen, chess]); // eslint-disable-line react-hooks/exhaustive-deps

  const browsing = viewPly !== null && viewPly < history.length;

  const board = useMemo(() => {
    const out: BoardSquare[] = [];
    viewChess.board().forEach((row, r) =>
      row.forEach((sq, c) => {
        const name = ("abcdefgh"[c] + (8 - r)) as CSquare;
        out.push({ square: sq ? (sq.square as CSquare) : name, piece: sq });
      })
    );
    return out;
  }, [fen, chess]); // eslint-disable-line react-hooks/exhaustive-deps

  const legalTargets = useMemo(() => {
    if (!selected || browsing) return new Set<string>();
    return new Set(
      (chess.moves({ square: selected as CSquare, verbose: true }) as Move[]).map((m) => m.to)
    );
  }, [selected, fen, chess]); // eslint-disable-line react-hooks/exhaustive-deps

  const checkSquare = useMemo(() => {
    if (!viewChess.inCheck()) return null;
    for (const row of viewChess.board())
      for (const sq of row)
        if (sq && sq.type === "k" && sq.color === viewChess.turn()) return sq.square;
    return null;
  }, [viewChess]); // eslint-disable-line react-hooks/exhaustive-deps

  function applyClockIncrement() {
    const inc = (incSec || game?.incrementSeconds || 0) * 1000;
    if (chess.turn() === "w") setWhiteMs((ms) => ms + inc);
    else setBlackMs((ms) => ms + inc);
  }

  function tryMove(from: string, to: string) {
    const legalAll = chess.moves({ square: from as CSquare, verbose: true }) as Move[];
    if (!legalAll.some((m) => m.to === to)) return false;
    if (legalAll.some((m) => m.to === to && m.promotion)) {
      // promotion: stop and ask which piece
      setPendingPromo({ from, to });
      return true;
    }
    return commitMove(from, to);
  }

  function commitMove(from: string, to: string, promotion?: string) {
    const mv = chess.move({ from, to, promotion: promotion ?? "q" });
    mv?.captured ? sounds.capture() : sounds.move();
    if (chess.inCheck()) sounds.check();
    applyClockIncrement();
    setLastMove({ from, to });
    setSelected(null);
    setPendingPromo(null);
    setFen(chess.fen());
    const gid = game?.id ?? gameId;
    if (gid) {
      appliedPly.current += 1;
      submitMove(gid, { from, to, promotion: promotion ?? "q" }).then((r) => {
        if (!r.ok) {
          if (r.code?.includes("timeout")) finish(myColor);
          else if (r.code?.includes("over") || r.code?.includes("not_found")) finish();
          // not_your_turn / illegal: a fresh poll will resync us
        } else if (!human) {
          setTimeout(botTurn, 350);
        }
      });
    }
    if (chess.isGameOver()) finish();
    return true;
  }

  async function botTurn() {
    const gid = game?.id ?? gameId;
    if (!gid) return;
    const r = await serverBotMove(gid);
    if (!r.san) {
      finish();
      return;
    }
    let mv: Move;
    try {
      mv = chess.move(r.san);
    } catch {
      finish();
      return;
    }
    appliedPly.current = chess.history().length;
    applyClockIncrement();
    setLastMove({ from: mv.from, to: mv.to });
    setFen(chess.fen());
    if (chess.isGameOver()) finish();
  }

  function onSquare(sq: string) {
    if (browsing) return;
    if (phase !== "active" || chess.turn() !== myColor) return;
    if (selected && tryMove(selected, sq)) return;
    const piece = chess.get(sq as CSquare);
    if (piece && piece.color === myColor) setSelected(sq);
    else setSelected(null);
  }

  async function doDraw() {
    const gid = game?.id ?? gameId;
    if (!gid) return;
    if (human) {
      const r = await offerDraw(gid).catch(() => null);
      if (r?.ok) setDrawOffered(true);
    } else {
      setDrawOffered(true); // bot always declines
    }
  }

  const myTurn = phase === "active" && chess.turn() === myColor;
  const canAbort = history.length === 0;
  const meName = me.name === "You" ? "You" : me.name;

  if (!game && !gameId)
    return (
      <main className="grid min-h-dvh place-items-center">
        <p className="text-sm text-text-muted">Preparing board…</p>
      </main>
    );

  const mySide = myColor === "w" ? "white" : "black";
  const oppSide = myColor === "w" ? "black" : "white";
  const top = flipped ? { ...me, name: meName } : opponent;
  const bottom = flipped ? opponent : { ...me, name: meName };
  const orientation = flipped ? oppSide : mySide;
  // clocks stay glued to the player, not the seat
  const topClock = flipped ? (myColor === "w" ? whiteMs : blackMs) : myColor === "w" ? blackMs : whiteMs;
  const bottomClock = flipped ? (myColor === "w" ? blackMs : whiteMs) : myColor === "w" ? whiteMs : blackMs;
  const topLow = phase === "active" && topClock < 10000;
  const bottomLow = phase === "active" && bottomClock < 10000;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 p-4">
      <PlayerBanner
        name={top.name}
        rating={top.rating}
        avatar={top.avatar}
        clockMs={topClock}
        active={phase === "active" && chess.turn() !== myColor}
        low={topLow}
      />

      <Board
        board={board}
        orientation={orientation}
        selected={selected}
        legalTargets={legalTargets}
        lastMove={lastMove}
        checkSquare={checkSquare}
        onSquare={onSquare}
      />

      <PlayerBanner
        name={bottom.name}
        rating={bottom.rating}
        avatar={bottom.avatar}
        clockMs={bottomClock}
        active={phase === "active" && chess.turn() === myColor}
        low={bottomLow}
      />

      <div className="flex items-center justify-between gap-2">
        <div role="group" aria-label="Move playback" className="flex gap-1">
          {[
            { label: "⏮", title: "First move", go: () => setViewPly(0), dis: !(history.length > 0) },
            { label: "◀", title: "Previous move", go: () => setViewPly((p) => Math.max(0, (p ?? history.length) - 1)), dis: !(history.length > 0 && (viewPly ?? 1) > 0) },
            { label: "▶", title: "Next move", go: () => setViewPly((p) => { const n = (p ?? 0) + 1; return n >= history.length ? null : n; }), dis: !browsing },
            { label: "⏭", title: "Latest move", go: () => setViewPly(null), dis: !browsing },
          ].map((b) => (
            <button
              key={b.label}
              title={b.title}
              aria-label={b.title}
              disabled={b.dis}
              onClick={b.go}
              className="min-h-9 min-w-9 rounded-md border border-border bg-surface-raised text-sm disabled:opacity-40"
            >
              {b.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setFlipped((f) => !f)}
          aria-pressed={flipped}
          aria-label={flipped ? "Board flipped — press to unflip" : "Flip board"}
          title="Flip board"
          className="min-h-9 rounded-md border border-border bg-surface-raised px-3 text-sm"
        >
          ⇅ Flip
        </button>
      </div>
      {browsing && (
        <p className="text-center text-xs text-text-muted" role="status">
          Viewing move {viewPly} of {history.length} — press ⏭ to return to the live game
        </p>
      )}

      <p className="text-center text-sm text-text-muted" aria-live="polite">
        {phase === "finished"
          ? `${outcome?.result}${outcome?.reason ? ` — ${outcome.reason}` : ""}`
          : myTurn
            ? "Your move"
            : `${top.name} is thinking…`}
      </p>

      {incomingDraw && phase === "active" && (
        <div className="flex items-center gap-2 rounded-md border border-border bg-surface p-2" role="alertdialog" aria-label="Draw offer">
          <span className="flex-1 text-sm">{top.name} offers a draw.</span>
          <Button
            variant="secondary"
            className="px-3"
            onClick={async () => {
              const gid = game?.id ?? gameId;
              if (gid) await respondDraw(gid, true).catch(() => null);
              setIncomingDraw(false);
              if (gid) finishFromServer("1/2-1/2", "draw_agreement");
            }}
          >
            Accept
          </Button>
          <Button
            className="px-3"
            onClick={async () => {
              const gid = game?.id ?? gameId;
              if (gid) await respondDraw(gid, false).catch(() => null);
              setIncomingDraw(false);
            }}
          >
            Decline
          </Button>
        </div>
      )}

      {drawOffered && phase === "active" && !incomingDraw && (
        <p role="status" className="rounded-md border border-border bg-surface p-3 text-center text-sm text-text-muted">
          {human
            ? "Draw offered — waiting for your opponent…"
            : "You offered a draw. The bot declined — play on!"}
        </p>
      )}

      {phase === "active" ? (
        <div className="flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={doDraw}>
            ½ Draw
          </Button>
          {canAbort ? (
            <Button variant="secondary" className="flex-1" onClick={() => setAbortOpen(true)}>
              ⊘ Abort
            </Button>
          ) : (
            <Button variant="secondary" className="flex-1" onClick={() => setResignOpen(true)}>
              ⚑ Resign
            </Button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Button onClick={() => (window.location.href = "/")} className="flex-1">
              New game
            </Button>
            {!human && (
              <Button
                variant="secondary"
                className="flex-1"
                onClick={async () => {
                  const g = await createBotGame(baseSec || 600, incSec || 0);
                  window.location.href = `/play?g=${g.id}&tc=${baseSec || 600}+${incSec || 0}`;
                }}
              >
                Rematch bot
              </Button>
            )}
            <Button
              variant="secondary"
              className="flex-1"
              onClick={() => {
                const pgn = [
                  `[White "${myColor === "w" ? meName : top.name}"]`,
                  `[Black "${myColor === "w" ? top.name : meName}"]`,
                  `[Result "${outcome?.result.split(" ")[0] ?? "*"}"]`,
                  "",
                  chess.pgn(),
                ].join("\n");
                void navigator.clipboard?.writeText(pgn);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
            >
              {copied ? "Copied!" : "Copy PGN"}
            </Button>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Game panels" className="mt-1 flex gap-3 border-b border-border text-sm">
        {(["moves", "analysis", ...(human ? ["chat" as const] : [])] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-none pb-2 pt-1 ${
              tab === t ? "border-b-2 border-accent text-text" : "text-text-muted"
            }`}
          >
            {t === "moves" ? "Moves" : t === "analysis" ? "Analysis" : "Chat"}
          </button>
        ))}
      </div>

      {tab === "moves" ? (
        <MoveList moves={history.map((m) => ({ san: m.san }))} opening={openingName(history.map((m) => m.san))} />
      ) : tab === "analysis" ? (
        <EvalBar cp={materialEval(chess)} />
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-2">
          <div
            aria-label="Chat messages"
            className="flex max-h-40 flex-col gap-1 overflow-y-auto"
          >
            {chat.length === 0 && <p className="text-xs text-text-muted">Say hello — chat is only visible to the two players.</p>}
            {chat.map((m, i) => (
              <p key={i} className="text-sm">
                <span className="font-semibold">{m.username === meName ? "You" : m.username}: </span>
                <span className="text-text-muted">{m.body}</span>
              </p>
            ))}
          </div>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const gid = game?.id ?? gameId;
              const text = chatDraft.trim();
              if (!gid || !text) return;
              setChatDraft("");
              await sendChat(gid, text).catch(() => null);
              const msgs = await loadChat(gid).catch(() => null);
              if (msgs) setChat(msgs.map(({ body, username }) => ({ body, username })));
            }}
          >
            <input
              aria-label="Chat message"
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              maxLength={300}
              className="min-h-9 flex-1 rounded-md border border-border bg-surface-raised px-2 text-sm"
              placeholder="Message…"
            />
            <button type="submit" className="rounded-md border border-border bg-surface-raised px-3 text-sm">
              Send
            </button>
          </form>
        </div>
      )}

      {pendingPromo && (
        <div
          role="dialog"
          aria-label="Choose promotion piece"
          className="fixed inset-0 z-50 grid place-items-center bg-black/60"
        >
          <div className="rounded-lg border border-border bg-surface p-4 shadow-card">
            <p className="mb-3 text-center text-sm font-semibold text-text">Promote to…</p>
            <div className="flex gap-2">
              {(["q", "r", "b", "n"] as const).map((p) => (
                <button
                  key={p}
                  aria-label={`Promote to ${p}`}
                  className="grid size-14 place-items-center rounded-md border border-border bg-surface hover:bg-accent-soft text-4xl"
                  onClick={() => commitMove(pendingPromo.from, pendingPromo.to, p)}
                >
                  {GLYPH[p]}
                </button>
              ))}
            </div>
            <button
              className="mt-3 w-full text-sm text-text-muted hover:text-text"
              onClick={() => setPendingPromo(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      <Dialog
        open={resignOpen}
        danger
        title="Resign this game?"
        body={human ? "Resigning counts as a loss. Your opponent gets the point." : "Resigning counts as a loss. The bot gets the point."}
        confirmLabel="Resign"
        onCancel={() => setResignOpen(false)}
        onConfirm={() => {
          setResignOpen(false);
          const gid = game?.id ?? gameId;
          if (gid) void resignGame(gid);
          finish(null, myColor);
        }}
      />

      <Dialog
        open={abortOpen}
        danger
        title="Abort this game?"
        body="Aborting is only possible before the first move. Repeatedly aborting games is unfair to opponents — abort only if this game can't be played."
        confirmLabel="Abort game"
        onCancel={() => setAbortOpen(false)}
        onConfirm={async () => {
          setAbortOpen(false);
          const gid = game?.id ?? gameId;
          if (gid) await abortGame(gid).catch(() => null);
          finishFromServer("*", "aborted");
        }}
      />
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
