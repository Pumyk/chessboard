// Data layer — real API edition. Same signatures the slice stub had, so
// screens don't change: getMe() stays sync (cached after bootstrap),
// createBotGame returns a real game row.

export type Player = { id: string; name: string; avatar: string; rating: number | null };
export type Rating = { category: "bullet" | "blitz" | "rapid"; glicko: number; games_played: number; provisional: boolean };
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

async function api(path: string, body?: unknown, method?: string): Promise<any> {
  const res = await fetch(`/api${path}`, {
    method: method ?? (body === undefined ? "GET" : "POST"),
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
  myRatings = ratings;
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

export let myRatings: Rating[] = [];

export function cachedRatings(): Rating[] {
  return myRatings;
}

// Fetch fresh identity (after login/logout/skill change) and update the cache.
export async function refreshMe(): Promise<Player> {
  cached = null;
  return bootstrap();
}

export async function signup(email: string, password: string, skillLevel?: number): Promise<Player> {
  const { profile, ratings } = await api("/auth/signup", {
    email, password, ...(skillLevel ? { skill_level: skillLevel } : {}),
  });
  cached = { id: profile.id, name: profile.username, avatar: profile.username.slice(0, 2).toUpperCase(), rating: null };
  myRatings = ratings;
  return cached;
}

export async function login(email: string, password: string): Promise<Player> {
  const { profile, ratings } = await api("/auth/login", { email, password });
  cached = { id: profile.id, name: profile.username, avatar: profile.username.slice(0, 2).toUpperCase(), rating: null };
  myRatings = ratings;
  return cached;
}

export async function logout(): Promise<void> {
  await api("/auth/logout", {}, "POST");
  cached = null;
  myRatings = [];
}

export async function setSkillLevel(level: number): Promise<Rating[]> {
  const { ratings } = await api("/me", { skill_level: level }, "PATCH");
  myRatings = ratings;
  return ratings;
}

export async function sendChat(gameId: string, text: string): Promise<void> {
  await api(`/games/${gameId}/chat`, { body: text });
}

export async function loadChat(gameId: string): Promise<{ body: string; username: string; created_at: string }[]> {
  const { messages } = await api(`/games/${gameId}/chat`);
  return messages;
}

export async function createChallenge(
  seconds: number, increment: number, rated = true
): Promise<{ id: string; link: string; code: string }> {
  const { challenge } = await api("/challenges", {
    time_control_seconds: seconds, increment_seconds: increment, rated,
  });
  return challenge;
}

export async function acceptChallenge(id: string): Promise<{ status: string; game_id?: string }> {
  return api(`/challenges/${id}`, {}, "POST");
}

export async function getChallenge(id: string): Promise<{ status: string; game_id: string | null }> {
  const { challenge } = await api(`/challenges/${id}`);
  return challenge;
}

export async function acceptChallengeByCode(
  code: string
): Promise<{ status: string; game_id?: string }> {
  return api("/challenges/accept", { code });
}

export type PlyEval = { ply: number; san: string | null; cp: number; mate: boolean };

export async function analyseGame(id: string): Promise<PlyEval[]> {
  const { evals } = await api(`/games/${id}/analysis`, {}, "POST");
  return evals;
}

export async function fetchLeaderboard(category: string): Promise<{ username: string; glicko: number; games_played: number }[]> {
  const { players } = await api(`/leaderboard?category=${encodeURIComponent(category)}`);
  return players;
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
    black: { id: `bot-${botElo}`, name: "Bot", avatar: "B", rating: botElo },
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


export async function quickPair(
  seconds: number,
  increment: number
): Promise<{ status: "paired" | "searching"; game_id?: string; ticket_id?: string }> {
  return api("/games/quick", {
    time_control_seconds: seconds,
    increment_seconds: increment,
  });
}

export async function cancelQuick(ticketId: string): Promise<{ ok: boolean }> {
  return api("/games/quick/cancel", { ticket_id: ticketId });
}

export async function loadGame(gameId: string): Promise<{
  game: {
    id: string; type: string; status: string; result: string; end_reason: string | null;
    white_id: string; black_id: string; rated: boolean; category: string;
    time_control_seconds: number; increment_seconds: number;
    fen: string; turn: "w" | "b";
    draw_offer_by: string | null;
    clock_white_ms: number; clock_black_ms: number; turn_started_at: string;
    first_move_at: string | null;
  };
  moves: { ply: number; san: string }[];
  clocks: { w: number; b: number };
  players: { id: string; username: string }[];
}> {
  return api(`/games/${gameId}`);
}

export async function offerDraw(gameId: string): Promise<{ ok: boolean }> {
  return api(`/games/${gameId}/draw-offer`, {});
}

export async function respondDraw(gameId: string, accept: boolean): Promise<{ ok: boolean }> {
  return api(`/games/${gameId}/draw-respond`, { accept });
}

export async function abortGame(gameId: string): Promise<{ ok: boolean }> {
  return api(`/games/${gameId}/abort`, {});
}

export async function claimTimeout(gameId: string): Promise<{ ok: boolean }> {
  return api(`/games/${gameId}/claim-timeout`, {});
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
