// Zentrale Einstellungen und Schwellenwerte. Alle Prozentwerte sind
// Gewinnwahrscheinlichkeit in Prozentpunkten (0–100) aus Sicht des ziehenden Spielers.

export const ENGINE = {
  // Stockfish 19, jeweils die Single-Thread-Fassung (braucht keine besonderen Server-Header).
  // Mehrere Instanzen laufen parallel (workers), das ersetzt die Threads.
  variants: {
    full: { file: 'vendor/stockfish/stockfish-19-single.js', label: 'Stockfish 19 (voll, ca. 95 MB, stärker)' },
    lite: { file: 'vendor/stockfish/stockfish-19-lite-single.js', label: 'Stockfish 19 Lite (1,8 MB, schneller geladen)' },
  },
  defaultVariant: 'full',
  defaultDepth: 16,
  minDepth: 8,
  maxDepth: 26,
  multiPv: 3,          // Anzahl Varianten pro Stellung (für "Großartig" mind. 2)
  hashMb: 16,          // Hash pro Engine-Instanz
  // Parallel laufende Engine-Instanzen (je ein Web Worker)
  workers: Math.max(1, Math.min(4, ((globalThis.navigator?.hardwareConcurrency) || 2) - 1)),
};

// Umrechnung Bewertung -> Gewinnwahrscheinlichkeit (Lichess-Formel)
export const WIN_PCT = {
  k: 0.00368208,
  cpCeiling: 1000,     // Bewertungen werden auf ±10 Bauern begrenzt
  // Wie bei Chess.com hängt die Einordnung von der Spielstärke ab: Bei schwächeren
  // Spielern entscheidet ein Bauer weniger, die Kurve ist flacher. Faktor auf k:
  // 1 + (Wertung − 1500) / 4000, begrenzt auf 0,8 … 1,3 (eigene Näherung,
  // Chess.com veröffentlicht seine Werte nicht). false = immer Lichess-Kurve.
  ratingScaled: true,
};

// Faktor für die Kurve abhängig von der Wertung des ziehenden Spielers
export function ratingFactor(rating) {
  if (!WIN_PCT.ratingScaled || !rating) return 1;
  return Math.max(0.8, Math.min(1.3, 1 + (rating - 1500) / 4000));
}

// Verlust gegenüber dem besten Zug (Obergrenzen, jeweils "kleiner als")
export const THRESHOLDS = {
  excellent: 2,        // Ausgezeichnet: < 2 %
  good: 5,             // Gut: < 5 %
  inaccuracy: 10,      // Ungenauigkeit: 5–10 %
  mistake: 20,         // Fehler: 10–20 %, darüber Blunder
};

// Großartig (Chess.com: "kritischer Zug" – der einzige gute Zug, oder einer, der aus
// Verlust Ausgleich bzw. aus Ausgleich Gewinn macht)
export const GREAT = {
  minGap: 13,          // zweitbester Zug ist mind. so viel schlechter als der beste
  minGapBeginner: 10,  // … großzügiger unter 1000 Wertung (wie bei Chess.com)
  minWinAfter: 25,     // Stellung wird gehalten: nach dem Zug noch mind. so viel
  maxWinSecond: 75,    // war auch der zweitbeste Zug noch klar gewonnen, ist es nicht "einzig"
  excludeRecaptures: true, // Zurückschlagen auf dem Feld des letzten Schlagzugs zählt nicht
  excludeMateInOne: true,  // ein Mattzug selbst ist "Bester Zug", nicht "Großartig"
  // Aus dem Schach mit höchstens so vielen legalen Zügen: eher erzwungen als großartig
  maxLegalInCheck: 3,
};

// Brillant (Chess.com: "ein gutes Figurenopfer" – bester oder fast bester Zug,
// man steht danach nicht schlecht und war nicht ohnehin schon völlig gewonnen)
export const BRILLIANT = {
  maxLoss: 2,          // "fast bester Zug": Verlust höchstens so viel …
  maxLossBeginner: 5,  // … großzügiger unter 1000 Wertung
  minWinAfter: 45,     // nach dem Opfer steht man nicht schlechter als ausgeglichen
  // "ohnehin gewonnen": auch der zweitbeste Zug hätte noch so viel gebracht
  // (93 % ≈ +7 Bauern bei Wertung 1500)
  maxWinSecond: 93,
  // Opfer = Figur (Springer oder mehr) hängt nach dem Zug. Auch eine Figur, die
  // schon angegriffen war und bewusst stehen gelassen wird, zählt (indirektes Opfer).
  countIgnoredThreats: true,
};

// Wertung, unter der Chess.com großzügiger mit Brillant/Großartig ist
export const BEGINNER_RATING = 1000;

// Verpasster Gewinn: Gegner hat gepatzt, der Spieler nutzt es nicht
export const MISS = {
  minOpponentLoss: 10, // vorheriger Gegnerzug war mindestens ein Fehler
  minLoss: 10,         // eigener Zug verliert mindestens so viel
  minBestWin: 60,      // mit dem besten Zug hätte man klar besser gestanden
  tolerance: 10,       // nach dem Zug steht man ungefähr wieder wie vor dem Gegnerfehler
};

// Zugklänge
export const SOUNDS = {
  defaultVolume: 0.6,  // 0 bis 1, im Einstellungsdialog änderbar
  // Eigene Klangdateien statt der erzeugten Klänge, z. B.
  //   move: 'sounds/move.mp3', capture: 'sounds/capture.mp3', castle: …, promote: …, check: …
  files: {},
};

// Materialwerte für die Opfererkennung
export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 };
