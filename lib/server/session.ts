import { cookies } from "next/headers";
import crypto from "crypto";
import { db, type Profile } from "./db";

// Two identities, matching chess.com's flow:
//  - members: email + password login (scrypt hash in profiles), a signed
//    session cookie we mint in /api/auth/*. Supabase Auth is still honoured
//    when configured (production).
//  - guests: a signed profile id in an http-only cookie we mint in POST /api/me
// Both cookies are signed (HMAC-SHA256) so a client can't impersonate anyone
// by editing the cookie.

const GUEST_COOKIE = "cb_guest";
const MEMBER_COOKIE = "cb_member";
const MAX_AGE = 60 * 60 * 24 * 90; // guests last 90 days

function sign(value: string): string {
  const secret = process.env.SERVER_SECRET ?? "dev-secret-change-me";
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: MAX_AGE,
    path: "/",
  } as const;
}

export async function setGuestCookie(profileId: string): Promise<void> {
  const jar = await cookies();
  jar.set(GUEST_COOKIE, `${profileId}.${sign(profileId)}`, cookieOptions());
}

export async function setMemberCookie(profileId: string): Promise<void> {
  const jar = await cookies();
  jar.set(MEMBER_COOKIE, `${profileId}.${sign(profileId)}`, cookieOptions());
}

export async function clearAuthCookies(): Promise<void> {
  const jar = await cookies();
  jar.delete(MEMBER_COOKIE);
  jar.delete(GUEST_COOKIE);
}

// scrypt password hashing (no external deps): salt$hash, base64url
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("base64url");
  const hash = crypto.scryptSync(password, salt, 32).toString("base64url");
  return `${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string | null): boolean {
  if (!stored) return false;
  const [salt, hash] = stored.split("$");
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 32).toString("base64url");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}

export async function getSession(): Promise<Profile | null> {
  const jar = await cookies();

  // member (local email login): signed profile id cookie
  const memberRaw = jar.get(MEMBER_COOKIE)?.value;
  if (memberRaw) {
    const [id, sig] = memberRaw.split(".");
    if (id && sig && sign(id) === sig) {
      const [profile] = await db`select * from profiles where id = ${id} and not is_guest`;
      if (profile) return (profile as unknown as Profile) ?? null;
    }
  }

  // member: supabase-js stores the session as sb-<ref>-auth-token (base64 JSON)
  const sbCookie = jar
    .getAll()
    .find((c) => c.name.startsWith("sb-") && c.name.endsWith("-auth-token"));
  if (sbCookie && process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY) {
    try {
      const session = JSON.parse(Buffer.from(sbCookie.value, "base64").toString("utf8"));
      const { createClient } = await import("@supabase/supabase-js");
      const supa = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
      const { data } = await supa.auth.getUser(session.access_token);
      if (data.user) {
        const [profile] = await db`select * from profiles where auth_user_id = ${data.user.id}`;
        return (profile as unknown as Profile) ?? null;
      }
    } catch {
      // fall through to guest
    }
  }

  // guest
  const raw = jar.get(GUEST_COOKIE)?.value;
  if (raw) {
    const [id, sig] = raw.split(".");
    if (id && sig && sign(id) === sig) {
      const [profile] = await db`select * from profiles where id = ${id} and is_guest`;
      return (profile as unknown as Profile) ?? null;
    }
  }
  return null;
}

const ADJ = ["Swift", "Calm", "Bold", "Quiet", "Sharp", "Lucky", "Steady", "Clever"];
const NOUN = ["Pawn", "Rook", "Knight", "Bishop", "Queen", "King", "Castle", "Gambit"];

export function guestName(): string {
  const r = (n: string[]) => n[Math.floor(Math.random() * n.length)];
  return `${r(ADJ)}${r(NOUN)}${Math.floor(Math.random() * 900 + 100)}`;
}
