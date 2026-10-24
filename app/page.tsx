"use client";
// S01 lobby + S03 searching screen: time control, then quick pair against a
// human opponent (with cancel + tips) or start a bot game.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import {
  cancelQuick, cachedRatings, createBotGame, createChallenge, getChallenge,
  acceptChallengeByCode,
  getMe, logout, quickPair, refreshMe,
} from "@/lib/datalayer";

// The full chess.com preset set
const CONTROLS: { label: string; seconds: number; increment: number; group: string }[] = [
  { label: "1 min", seconds: 60, increment: 0, group: "Bullet" },
  { label: "1 + 1", seconds: 60, increment: 1, group: "Bullet" },
  { label: "2 + 1", seconds: 120, increment: 1, group: "Bullet" },
  { label: "3 min", seconds: 180, increment: 0, group: "Blitz" },
  { label: "3 + 2", seconds: 180, increment: 2, group: "Blitz" },
  { label: "5 min", seconds: 300, increment: 0, group: "Blitz" },
  { label: "10 min", seconds: 600, increment: 0, group: "Rapid" },
  { label: "10 + 5", seconds: 600, increment: 5, group: "Rapid" },
  { label: "15 + 10", seconds: 900, increment: 10, group: "Rapid" },
];

const TIPS = [
  "Tip: control the center early — it gives your pieces room to move.",
  "Tip: castle in the first ten moves to keep your king safe.",
  "Tip: don't move the same piece twice in the opening.",
  "Tip: every move, ask what your opponent's last move threatens.",
  "Tip: trade pieces when you're ahead, keep the tension when behind.",
];

type Mode = "idle" | "searching" | "starting-bot" | "challenging";

export default function Lobby() {
  const router = useRouter();
  const [sel, setSel] = useState(CONTROLS[6]);
  const [ident, setIdent] = useState(getMe());
  const [ratings, setRatings] = useState<ReturnType<typeof cachedRatings>>([]);
  const [tick, setTick] = useState(0);
  const [challenge, setChallenge] = useState<{ id: string; link: string; code: string } | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const [joinErr, setJoinErr] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("idle");
  const [tip, setTip] = useState(0);
  const [seconds, setSeconds] = useState(0);
  const ticketRef = useRef<string | null>(null);
  const cancelledRef = useRef(false);
  // identity + ratings refresh on every visit (login/logout, skill change)
  useEffect(() => {
    refreshMe()
      .then(() => { setIdent(getMe()); setRatings(cachedRatings()); })
      .catch(() => null);
  }, [tick]);

  useEffect(() => {
    if (!challenge) return;
    const id = setInterval(async () => {
      const c = await getChallenge(challenge.id).catch(() => null);
      if (c?.status === "accepted" && c.game_id) router.push(`/play?g=${c.game_id}`);
    }, 2000);
    return () => clearInterval(id);
  }, [challenge, router]);

  useEffect(() => {
    if (mode !== "searching") { setElapsed(0); return; }
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [mode]);

  useEffect(() => {
    if (mode !== "searching") return;
    const id = setInterval(() => setSeconds((s) => s + 1), 1000);
    const tips = setInterval(() => setTip((t) => (t + 1) % TIPS.length), 5000);
    return () => {
      clearInterval(id);
      clearInterval(tips);
    };
  }, [mode]);

  async function searchOnline() {
    setMode("searching");
    setSeconds(0);
    cancelledRef.current = false;
    const started = Date.now();
    let backoff = 1200;
    while (!cancelledRef.current) {
      const r = await quickPair(sel.seconds, sel.increment).catch(() => null);
      if (cancelledRef.current) return;
      if (r?.status === "paired") {
        router.push(`/play?g=${r.game_id}`);
        return;
      }
      if (r?.status === "searching") ticketRef.current = r.ticket_id ?? null;
      // widen the poll a little as the search goes on (first check is quick)
      await new Promise((res) => setTimeout(res, Math.min(backoff, 3000)));
      backoff += 100;
      if (Date.now() - started > 120000) break; // give up after 2 minutes
    }
  }

  async function cancelSearch() {
    cancelledRef.current = true;
    const id = ticketRef.current;
    if (id) await cancelQuick(id).catch(() => null);
    setMode("idle");
  }

  async function joinByCode(e: React.FormEvent) {
    e.preventDefault();
    if (!joinCode.trim() || joinBusy) return;
    setJoinBusy(true);
    setJoinErr(null);
    const r = await acceptChallengeByCode(joinCode.trim()).catch((err) => ({
      error: err instanceof Error ? err.message : "join failed",
    }));
    setJoinBusy(false);
    if (r && "game_id" in r && r.game_id) {
      router.push(`/play?g=${r.game_id}`);
      return;
    }
    setJoinErr((r as { error?: string })?.error ?? "Couldn't join that code.");
  }

  async function startBot() {
    setMode("starting-bot");
    const g = await createBotGame(sel.seconds, sel.increment);
    router.push(`/play?g=${g.id}&tc=${sel.seconds}+${sel.increment}`);
  }

  if (challenge) {
    const url = typeof window !== "undefined" ? `${window.location.origin}${challenge.link}` : challenge.link;
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-5 p-8 text-center">
        <h1 className="text-lg font-bold">Waiting for your friend…</h1>
        <p className="text-sm text-text-muted">Share this link — the game starts the moment they open it.</p>
        <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-surface p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted">Room code</p>
          <p className="text-3xl font-bold tracking-[0.3em] tabular-nums">{challenge.code}</p>
          <p className="text-xs text-text-muted">…or they can type this code under &ldquo;Join with a code&rdquo;.</p>
        </div>
        <button
          className="w-full truncate rounded-md border border-border bg-surface-raised p-3 text-sm"
          onClick={async () => { await navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
          title="Copy challenge link"
        >
          {copied ? "Copied!" : url}
        </button>
        <Button variant="secondary" className="w-full" onClick={() => setChallenge(null)}>
          Cancel challenge
        </Button>
      </main>
    );
  }

  if (mode === "searching") {
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-8 text-center">
        <div aria-live="polite" className="flex flex-col items-center gap-3">
          <span
            className="inline-block h-10 w-10 animate-spin rounded-full border-4 border-accent border-t-transparent"
            aria-hidden
          />
          <h1 className="text-lg font-bold">Searching for a {sel.label} opponent…</h1>
          <p className="text-3xl font-bold tabular-nums">
            {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
          </p>
        </div>
        {elapsed >= 15 && (
          <p role="status" className="text-sm text-text-muted">
            Still searching — widening the rating range to find the closest match.
          </p>
        )}
        <p key={tip} className="min-h-10 text-sm text-text-muted">
          {TIPS[tip]}
        </p>
        <Button variant="secondary" onClick={cancelSearch} className="w-full">
          Cancel search
        </Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">ChessBoard</h1>
          <p className="text-sm text-text-muted">
            Playing as {ident.name}
            {ratings.length > 0 && (
              <span aria-label="My ratings" className="ml-2">
                {ratings.map((r) => (
                  <span key={r.category} className="ml-1 text-xs">
                    {({bullet: "Bu", blitz: "Bz", rapid: "R"} as Record<string, string>)[r.category] ?? r.category[0].toUpperCase()}
                    {" "}{r.provisional ? `${r.glicko}±${200}` : r.glicko}
                  </span>
                ))}
              </span>
            )}
          </p>
        </div>
        <nav
          aria-label="Main menu"
          className="flex items-center gap-1 rounded-pill border border-border bg-surface p-1 text-sm"
        >
          <a
            href="/leaderboard"
            className="rounded-pill px-3 py-1.5 text-text-muted transition-fast hover:bg-surface-raised hover:text-text"
          >
            Leaderboard
          </a>
          <a
            href="/settings"
            className="rounded-pill px-3 py-1.5 text-text-muted transition-fast hover:bg-surface-raised hover:text-text"
          >
            Settings
          </a>
          {ident.name === "You" ? (
            <a
              href="/account"
              className="rounded-pill px-3 py-1.5 text-text-muted transition-fast hover:bg-surface-raised hover:text-text"
            >
              Sign up
            </a>
          ) : (
            <button
              className="rounded-pill px-3 py-1.5 text-text-muted transition-fast hover:bg-surface-raised hover:text-text"
              onClick={async () => { await logout().catch(() => null); setTick((t) => t + 1); }}
            >
              Log out
            </button>
          )}
        </nav>
      </header>

      <section aria-labelledby="tc-h" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="tc-h" className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Time control
        </h2>
        <div className="flex flex-col gap-3">
          {["Bullet", "Blitz", "Rapid"].map((group) => (
            <div key={group}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-text-muted opacity-80">
                {group}
              </p>
              <div className="flex flex-wrap gap-2">
                {CONTROLS.filter((c) => c.group === group).map((c) => (
                  <button
                    key={c.label}
                    onClick={() => setSel(c)}
                    aria-pressed={sel.label === c.label}
                    className={`min-h-9 rounded-pill border px-3.5 text-xs font-semibold ${
                      sel.label === c.label
                        ? "border-accent bg-accent-soft text-text"
                        : "border-border bg-surface-raised text-text-muted hover:text-text"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Button onClick={searchOnline} className="w-full text-base">
        Play {sel.label} online
      </Button>
      <Button variant="secondary" onClick={startBot} disabled={mode === "starting-bot"} className="w-full">
        {mode === "starting-bot" ? "Preparing board…" : `Practice vs a bot (${sel.label})`}
      </Button>
      <Button variant="secondary" onClick={() => router.push(`/play?local=1&tc=${sel.seconds}+${sel.increment}`)} className="w-full">
        Pass and play on this device
      </Button>
      <Button
        variant="secondary"
        className="w-full"
        onClick={async () => {
          setMode("challenging");
          const c = await createChallenge(sel.seconds, sel.increment).catch(() => null);
          if (c) setChallenge(c);
          else setMode("idle");
        }}
      >
        Challenge a friend ({sel.label})
      </Button>

      <section
        aria-labelledby="join-h"
        className="rounded-lg border border-border bg-surface p-4"
      >
        <h2 id="join-h" className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Join with a code
        </h2>
        <form className="flex gap-2" onSubmit={joinByCode}>
          <input
            value={joinCode}
            onChange={(e) => {
              setJoinCode(e.target.value.toUpperCase());
              setJoinErr(null);
            }}
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            placeholder="FRIEND'S CODE"
            aria-label="Room code"
            className="min-h-12 w-full rounded-md border border-border-input bg-surface-raised px-4 text-center text-base font-bold tracking-[0.3em] tabular-nums outline-none focus-visible:border-accent"
          />
          <Button type="submit" variant="secondary" disabled={joinBusy || !joinCode.trim()}>
            {joinBusy ? "Joining…" : "Join"}
          </Button>
        </form>
        {joinErr && <p className="mt-2 text-xs text-danger">{joinErr}</p>}
      </section>

      <p className="text-center text-xs text-text-muted">
        Rated quick pairing against real opponents, or a casual unrated bot game.
      </p>
    </main>
  );
}
