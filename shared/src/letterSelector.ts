type Difficulty = 'easy' | 'medium' | 'hard';

const EASY = ['A', 'E', 'I', 'O', 'R', 'S', 'T', 'L', 'N'];
const MEDIUM = ['C', 'D', 'G', 'M', 'P', 'B', 'F', 'H'];
const HARD = ['J', 'K', 'Q', 'U', 'V', 'W', 'X', 'Y', 'Z'];

const ALL = [...EASY, ...MEDIUM, ...HARD];
const PATTERN: Difficulty[] = ['easy', 'medium', 'hard', 'medium', 'easy'];

function byDifficulty(level: Difficulty) {
  if (level === 'easy') return EASY;
  if (level === 'medium') return MEDIUM;
  return HARD;
}

function randomFrom(pool: string[]) {
  return pool[Math.floor(Math.random() * pool.length)] ?? 'A';
}

function pickFrom(pool: string[], blocked: Set<string>) {
  const allowed = pool.filter((l) => !blocked.has(l));
  if (allowed.length > 0) return randomFrom(allowed);
  return null;
}

export function selectNextLetter(history: string[], roundIndex: number) {
  const normalized = history.map((h) => h.toUpperCase()).filter((h) => ALL.includes(h));
  const blocked10 = new Set(normalized.slice(-10));
  const blocked5 = new Set(normalized.slice(-5));
  const target = byDifficulty(PATTERN[roundIndex % PATTERN.length]);

  return (
    pickFrom(target, blocked10) ??
    pickFrom(target, blocked5) ??
    pickFrom(ALL, blocked10) ??
    pickFrom(ALL, blocked5) ??
    randomFrom(target)
  );
}

