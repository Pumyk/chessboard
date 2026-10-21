"use client";
// Email sign-up / log-in with the skill-level picker chess.com asks at
// onboarding. Skill drives the initial rating estimate.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/Button";
import { getMe, login, signup } from "@/lib/datalayer";

const SKILLS = [
  { level: 1, label: "Beginner", hint: "New to chess" },
  { level: 2, label: "Casual", hint: "I know the rules and a few openings" },
  { level: 3, label: "Intermediate", hint: "I play regularly" },
  { level: 4, label: "Advanced", hint: "I study the game" },
];

export default function AccountPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [skill, setSkill] = useState(2);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const me = getMe();

  async function submit() {
    setBusy(true);
    setError("");
    try {
      if (mode === "signup") {
        await signup(email, password, skill);
      } else {
        await login(email, password);
      }
      router.push("/");
    } catch (e: unknown) {
      setError((e as Error).message ?? "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 p-4">
      <header>
        <h1 className="text-xl font-bold">{mode === "signup" ? "Create your account" : "Log in"}</h1>
        <p className="text-sm text-text-muted">
          {me.id !== "me" ? `Currently playing as guest: ${me.name}` : "Free, no email verification needed."}
        </p>
      </header>

      <div role="tablist" className="flex gap-3 border-b border-border text-sm">
        {(["signup", "login"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={mode === t}
            onClick={() => { setMode(t); setError(""); }}
            className={`pb-2 pt-1 ${mode === t ? "border-b-2 border-accent text-text" : "text-text-muted"}`}
          >
            {t === "signup" ? "Sign up" : "Log in"}
          </button>
        ))}
      </div>

      <label className="flex flex-col gap-1 text-sm">
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="min-h-11 rounded-md border border-border bg-surface-raised px-3 text-text"
          placeholder="you@example.com"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Password
        <input
          type="password"
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="min-h-11 rounded-md border border-border bg-surface-raised px-3 text-text"
          placeholder="At least 6 characters"
          onKeyDown={(e) => e.key === "Enter" && submit()}
        />
      </label>

      {mode === "signup" && (
        <fieldset className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
          <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-text-muted">
            How good are you at chess?
          </legend>
          {SKILLS.map((s) => (
            <button
              key={s.level}
              onClick={() => setSkill(s.level)}
              aria-pressed={skill === s.level}
              className={`flex min-h-11 items-center justify-between rounded-md border px-3 text-left ${
                skill === s.level ? "border-accent bg-accent-soft" : "border-border bg-surface-raised"
              }`}
            >
              <span className="text-sm font-semibold">{s.label}</span>
              <span className="text-xs text-text-muted">{s.hint}</span>
            </button>
          ))}
        </fieldset>
      )}

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}

      <Button onClick={submit} disabled={busy} className="w-full">
        {busy ? "Please wait…" : mode === "signup" ? "Create account" : "Log in"}
      </Button>

      {me.id !== "me" && (
        <button className="text-sm text-text-muted hover:text-text" onClick={() => router.push("/")}>
          Keep playing as a guest →
        </button>
      )}
    </main>
  );
}
