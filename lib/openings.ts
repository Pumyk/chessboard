// Tiny opening book: longest-prefix match over the SAN move list.
// Deliberately small (~60 entries, depth ≤ 8 plies) — enough for a header,
// not a claims-grade repertoire. Anything unmatched shows nothing.

const BOOK: { key: string; name: string }[] = [
  { key: "e4", name: "King's Pawn" },
  { key: "e4 e5", name: "Open Game" },
  { key: "e4 e5 Nf3", name: "King's Knight Opening" },
  { key: "e4 e5 Nf3 Nc6 Bb5", name: "Ruy López" },
  { key: "e4 e5 Nf3 Nc6 Bc4", name: "Italian Game" },
  { key: "e4 e5 Nf3 Nc6 Bc4 Bc5", name: "Italian: Giuoco Piano" },
  { key: "e4 e5 Nf3 Nc6 Bc4 Nf6", name: "Italian: Two Knights Defense" },
  { key: "e4 e5 Nf3 Nc6 d4", name: "Scotch Game" },
  { key: "e4 e5 Nf3 Nc6 Nc3", name: "Four Knights Game" },
  { key: "e4 e5 Nf3 Nf6", name: "Petrov Defense" },
  { key: "e4 e5 Nc3", name: "Vienna Game" },
  { key: "e4 e5 f4", name: "King's Gambit" },
  { key: "e4 e5 Bc4", name: "Bishop's Opening" },
  { key: "e4 e5 c4", name: "King's Gambit Deferred" },
  { key: "e4 c5", name: "Sicilian Defense" },
  { key: "e4 c5 Nf3 d6", name: "Sicilian: 2...d6" },
  { key: "e4 c5 Nf3 Nc6", name: "Sicilian: Old Sicilian" },
  { key: "e4 c5 Nf3 e6", name: "Sicilian: French Variation" },
  { key: "e4 c5 c3", name: "Sicilian: Alapin Variation" },
  { key: "e4 c5 Nc3", name: "Sicilian: Closed" },
  { key: "e4 e6", name: "French Defense" },
  { key: "e4 e6 d4 d5", name: "French: Main Line" },
  { key: "e4 e6 d4 d5 Nc3 Bb4", name: "French: Winawer" },
  { key: "e4 e6 d4 d5 e5", name: "French: Advance" },
  { key: "e4 c6", name: "Caro-Kann Defense" },
  { key: "e4 d5", name: "Scandinavian Defense" },
  { key: "e4 Nf6", name: "Alekhine Defense" },
  { key: "e4 d6", name: "Pirc Defense" },
  { key: "e4 g6", name: "Modern Defense" },
  { key: "d4", name: "Queen's Pawn" },
  { key: "d4 d5", name: "Closed Game" },
  { key: "d4 d5 c4", name: "Queen's Gambit" },
  { key: "d4 d5 c4 e6", name: "Queen's Gambit Declined" },
  { key: "d4 d5 c4 dxc4", name: "Queen's Gambit Accepted" },
  { key: "d4 d5 c4 c6", name: "Slav Defense" },
  { key: "d4 d5 c4 c5", name: "Tarrasch Defense" },
  { key: "d4 d5 Nf3", name: "Queen's Pawn: Zukertort" },
  { key: "d4 Nf6", name: "Indian Defense" },
  { key: "d4 Nf6 c4 e6", name: "Indian: East Indian" },
  { key: "d4 Nf6 c4 e6 Nc3 Bb4", name: "Nimzo-Indian Defense" },
  { key: "d4 Nf6 c4 e6 Nf3 b6", name: "Queen's Indian Defense" },
  { key: "d4 Nf6 c4 g6", name: "King's Indian Defense" },
  { key: "d4 Nf6 c4 g6 Nc3 Bg7", name: "King's Indian: Normal" },
  { key: "d4 Nf6 c4 c5", name: "Benoni Defense" },
  { key: "d4 f5", name: "Dutch Defense" },
  { key: "d4 e6", name: "Horwitz Defense" },
  { key: "c4", name: "English Opening" },
  { key: "c4 e5", name: "English: Reversed Sicilian" },
  { key: "c4 c5", name: "English: Symmetrical" },
  { key: "c4 Nf6", name: "English: Anglo-Indian" },
  { key: "Nf3", name: "Zukertort Opening" },
  { key: "Nf3 d5 g3", name: "Réti Opening" },
  { key: "g3", name: "Benko Opening" },
  { key: "b3", name: "Nimzo-Larsen Attack" },
  { key: "b4", name: "Sokolsky Opening" },
  { key: "f4", name: "Bird's Opening" },
  { key: "Nc3", name: "Dunst Opening" },
  { key: "e4 e5 Nf3 Nc6 Bb5 a6", name: "Ruy López: Morphy Defense" },
  { key: "e4 e5 Nf3 Nc6 Bb5 Nf6", name: "Ruy López: Berlin Defense" },
  { key: "e4 e6 d4 d5 Nc3 Nf6", name: "French: Classical" },
  { key: "d4 d5 c4 e6 Nc3 c6", name: "QGD: Semi-Slav" },
];

export function openingName(sanMoves: string[]): string | null {
  // longest matching prefix wins
  let bestName: string | null = null;
  let bestLen = 0;
  for (const { key, name } of BOOK) {
    const plies = key.split(" ");
    if (plies.length > sanMoves.length) continue;
    if (sanMoves.slice(0, plies.length).join(" ") === key && plies.length > bestLen) {
      bestName = name;
      bestLen = plies.length;
    }
  }
  return bestName;
}
