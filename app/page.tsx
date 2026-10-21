"use client";
// S01 lobby (slice version): time control + Start Game against a bot.
// Matchmaking panel lands with milestone 2.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { createBotGame, getMe } from "@/lib/datalayer";

const CONTROLS: { label: string; seconds: number; increment: number; group: string }[] = [
  { label: "1 min", seconds: 60, increment: 0, group: "Bullet" },
  { label: "1 + 1", seconds: 60, increment: 1, group: "Bullet" },
  { label: "3 min", seconds: 180, increment: 0, group: "Blitz" },
  { label: "5 min", seconds: 300, increment: 0, group: "Blitz" },
  { label: "10 min", seconds: 600, increment: 0, group: "Rapid" },
  { label: "15 + 10", seconds: 900, increment: 10, group: "Rapid" },
];

export default function Lobby() {
  const router = useRouter();
  const [sel, setSel] = useState(CONTROLS[4]);
  const [starting, setStarting] = useState(false);
  const me = getMe();

  async function start() {
    setStarting(true);
    const g = await createBotGame(sel.seconds, sel.increment);
    router.push(`/play?g=${g.id}&tc=${sel.seconds}+${sel.increment}`);
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header>
        <h1 className="text-xl font-bold">ChessBoard</h1>
        <p className="text-sm text-text-muted">
          Signed in as {me.name} — quick pairing arrives in the next build. Bot games work now.
        </p>
      </header>

      <section aria-labelledby="tc-h" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="tc-h" className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">
          Time control
        </h2>
        <div className="flex flex-wrap gap-2">
          {CONTROLS.map((c) => (
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
              <span className="sr-only">{c.group}: </span>
              {c.label}
            </button>
          ))}
        </div>
      </section>

      <Button onClick={start} disabled={starting} className="w-full text-base">
        {starting ? "Preparing board…" : `Start ${sel.label} game`}
      </Button>

      <p className="text-center text-xs text-text-muted">
        Rated play, opponents and friend challenges come with accounts. This build: you vs a bot.
      </p>
    </main>
  );
}
