// Data layer — real API edition. Same signatures the slice stub had, so
// screens don't change: getMe() stays sync (cached after bootstrap),
// createBotGame returns a real game row.

export type Player = { id: string; name: string; avatar: string; rating: number | null };
export type GameSnapshot = {
  id: string;
  white: Player;
  black: Player;
  timeControlSeconds: number;
  incrementSeconds: number;
  category: "bullet" | "blitz" | "rapid";
  type: "quick" | "challenge" | "bot" | "pass_and_play";
  rated: boolean;
};

const FALLBACK: Player = { id: "me", name: "You", avatar: "YU", rating: null };
let cached: Player | null = null;

async function api(path: string, body?: unknown): Promise<any> {
  const res = await fetch(`/api${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: "same-origin",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `API ${res.status}`);
  return data;
}

// POST /api/me creates the guest session (httpOnly cookie) on first launch.
export async function bootstrap(): Promise<Player> {
  const { profile, ratings } = await api("/me", {});
  const rapid = ratings.find((r: { category: string }) => r.category === "rapid");
  cached = {
    id: profile.id,
    name: profile.is_guest ? "You" : profile.username,
    avatar: profile.username.slice(0, 2).toUpperCase(),
    rating: rapid ? (rapid.provisional ? null : rapid.glicko) : null,
  };
  return cached;
}

export function getMe(): Player {
  if (cached) return cached;
  if (typeof window !== "undefined") void bootstrap(); // async fill; UI re-renders later
  return FALLBACK;
}

export async function createBotGame(
  seconds: number,
  increment: number,
  botElo = 800
): Promise<GameSnapshot> {
  const me = cached ?? (await bootstrap());
  const { game_id } = await api("/bots", {
    time_control_seconds: seconds,
    increment_seconds: increment,
    bot_elo: botElo,
  });
  return {
    id: game_id,
    white: me,
    black: { id: `bot-${botElo}`, name: `Bot (${botElo})`, avatar: "B", rating: botElo },
    timeControlSeconds: seconds,
    incrementSeconds: increment,
    category: seconds < 180 ? "bullet" : seconds < 600 ? "blitz" : "rapid",
    type: "bot",
    rated: false,
  };
}

// The server is the authority: it validates the move, applies increment and
// flags. The client applies optimistically and resyncs if the server disagrees.
export async function submitMove(
  gameId: string,
  move: { from: string; to: string; promotion?: string }
): Promise<{ ok: boolean; code?: string }> {
  try {
    return await api(`/games/${gameId}/moves`, move);
  } catch (e: unknown) {
    return { ok: false, code: (e as Error).message };
  }
}

export async function serverBotMove(gameId: string): Promise<{ san?: string; done?: boolean }> {
  return api(`/games/${gameId}/bot-move`, {});
}

export async function resignGame(gameId: string): Promise<{ ok: boolean }> {
  return api(`/games/${gameId}/resign`, {});
}

export async function fetchGame(gameId: string): Promise<{
  game: {
    status: string; result: string; end_reason: string | null;
    fen: string; clock_white_ms: number; clock_black_ms: number;
  };
  moves: { san: string }[];
}> {
  return api(`/games/${gameId}`);
}
