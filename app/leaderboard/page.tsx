"use client";
// Public leaderboard: top rated players per category.

import { useEffect, useState } from "react";
import Link from "next/link";
import { fetchLeaderboard } from "@/lib/datalayer";

const CATEGORIES = ["bullet", "blitz", "rapid"] as const;

export default function LeaderboardPage() {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>("blitz");
  const [players, setPlayers] = useState<{ username: string; glicko: number; games_played: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchLeaderboard(category)
      .then(setPlayers)
      .catch(() => setPlayers([]))
      .finally(() => setLoading(false));
  }, [category]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Leaderboard</h1>
        <Link href="/" className="text-sm text-text-muted hover:text-text">← Play</Link>
      </header>

      <div role="tablist" className="flex gap-3 border-b border-border text-sm">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            role="tab"
            aria-selected={category === c}
            onClick={() => setCategory(c)}
            className={`pb-2 pt-1 capitalize ${category === c ? "border-b-2 border-accent text-text" : "text-text-muted"}`}
          >
            {c}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-text-muted">Loading…</p>
      ) : players.length === 0 ? (
        <p className="text-sm text-text-muted">No rated games in this category yet — be the first!</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {players.map((p, i) => (
            <li
              key={p.username + i}
              className="flex items-center gap-3 rounded-md border border-border bg-surface px-3 py-2"
            >
              <span className="w-6 text-right text-sm font-bold tabular-nums text-text-muted">{i + 1}</span>
              <span className="flex-1 truncate text-sm font-semibold">{p.username}</span>
              <span className="text-sm tabular-nums">{p.glicko}</span>
              <span className="text-xs text-text-muted tabular-nums">{p.games_played} games</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
