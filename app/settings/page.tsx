"use client";
// S06 settings: board theme, coordinates, sound. Local preferences, applied
// live on the game screen. Piece sets: classic only for now.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  THEMES, getCoords, getSound, getThemeId, setCoords as saveCoords,
  setSound as saveSound, setThemeId,
  PIECE_SETS,
  getPieceSetId,
  setPieceSetId,
} from "@/lib/themes";
import { setSoundEnabled } from "@/lib/sounds";

export default function SettingsPage() {
  const [theme, setTheme] = useState(getThemeId());
  const [coords, setCoords] = useState(true);
  const [sound, setSound] = useState(true);
  const [pieceSet, setPieceSetState] = useState<"classic" | "letters">("classic");

  useEffect(() => {
    setCoords(getCoords());
    setPieceSetState(getPieceSetId());
    setSound(getSound());
    setSoundEnabled(getSound());
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 p-4">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-bold">Settings</h1>
        <Link href="/" className="text-sm text-text-muted hover:text-text">← Play</Link>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Board theme</h2>
        <div className="grid grid-cols-5 gap-2">
          {THEMES.map((t) => (
            <button
              key={t.id}
              aria-label={`${t.name} board`}
              aria-pressed={theme === t.id}
              onClick={() => { setTheme(t.id); saveTheme(t.id); }}
              className={`flex flex-col items-center gap-1 rounded-md border p-1 ${
                theme === t.id ? "border-accent" : "border-border"
              }`}
            >
              <span className="grid h-10 w-10 grid-cols-2 overflow-hidden rounded-sm">
                <span style={{ background: t.light }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.dark }} />
                <span style={{ background: t.light }} />
              </span>
              <span className="text-[10px] text-text-muted">{t.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Piece set</h2>
        <div className="grid grid-cols-2 gap-2">
          {PIECE_SETS.map((ps) => (
            <button
              key={ps.id}
              aria-label={`${ps.name} pieces`}
              aria-pressed={pieceSet === ps.id}
              onClick={() => { setPieceSetState(ps.id); setPieceSetId(ps.id); }}
              className={`flex flex-col items-center gap-1 rounded-md border p-2 ${
                pieceSet === ps.id ? "border-accent" : "border-border"
              }`}
            >
              <span className="text-2xl leading-none">
                {ps.id === "classic" ? "♕♚" : "KQ"}
              </span>
              <span className="text-[10px] text-text-muted">{ps.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Board</h2>
        <label className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
          Show coordinates
          <input
            type="checkbox"
            checked={coords}
            onChange={(e) => { setCoords(e.target.checked); saveCoords(e.target.checked); }}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Sound</h2>
        <label className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-sm">
          Move and check sounds
          <input
            type="checkbox"
            checked={sound}
            onChange={(e) => { setSound(e.target.checked); saveSound(e.target.checked); setSoundEnabled(e.target.checked); }}
          />
        </label>
      </section>

      <p className="text-xs text-text-muted">
        Piece sets: classic (only set in this build).
      </p>
    </main>
  );
}

function saveTheme(id: string) { setThemeId(id); }
