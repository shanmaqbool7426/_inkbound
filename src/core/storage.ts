import type { Vec } from './math';

export interface BeastRecord {
  id: string;
  created: number;
  outline: Vec[];
  score: number;
  arenaId: string;
  grade: string;
}

export interface SaveData {
  best: number;
  muted: boolean;
  tutorialSeen: boolean;
  runs: number;
  dailyBest: Record<string, number>;
  unlocked: number;
  arenaBest: Record<string, number>;
  arenaStars: Record<string, number>;
  beasts: BeastRecord[];
  arenaId: string;
}

const KEY = 'inkbound.save.v2';

const defaults: SaveData = {
  best: 0,
  muted: false,
  tutorialSeen: false,
  runs: 0,
  dailyBest: {},
  unlocked: 0,
  arenaBest: {},
  arenaStars: {},
  beasts: [],
  arenaId: 'meadow',
};

let cache: SaveData | null = null;

export function loadSave(): SaveData {
  if (cache) return cache;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      cache = {
        ...defaults,
        ...parsed,
        dailyBest: { ...(parsed.dailyBest ?? {}) },
        arenaBest: { ...(parsed.arenaBest ?? {}) },
        arenaStars: { ...(parsed.arenaStars ?? {}) },
        beasts: Array.isArray(parsed.beasts) ? parsed.beasts.slice(0, 8) : [],
      };
    } else {
      cache = { ...defaults, dailyBest: {}, arenaBest: {}, arenaStars: {}, beasts: [] };
    }
  } catch {
    cache = { ...defaults, dailyBest: {}, arenaBest: {}, arenaStars: {}, beasts: [] };
  }
  return cache;
}

export function patchSave(patch: Partial<SaveData>): void {
  const s = loadSave();
  Object.assign(s, patch);
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable — keep playing without persistence */
  }
}
