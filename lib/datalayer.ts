// Data layer stub — same signatures the real API will expose (architecture.md).
// The slice plays bot games fully client-side; replica-backend swaps these
// for fetch calls without touching any screen code.

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

const ME: Player = { id: "me", name: "You", avatar: "YU", rating: null };

export function getMe(): Player {
  return ME;
}

export async function createBotGame(
  seconds: number,
  increment: number,
  botElo = 800
): Promise<GameSnapshot> {
  const category = seconds < 180 ? "bullet" : seconds < 600 ? "blitz" : "rapid";
  return {
    id: `bot-${Date.now()}`,
    white: ME,
    black: { id: `bot-${botElo}`, name: `Bot (${botElo})`, avatar: "B", rating: botElo },
    timeControlSeconds: seconds,
    incrementSeconds: increment,
    category,
    type: "bot",
    rated: false,
  };
}
