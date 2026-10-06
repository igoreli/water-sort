import type { State } from './core/game';
import type { Puzzle } from './core/generator';
import type { Mode } from './core/modes';

/** A board in progress: enough to put the player back exactly where they were. */
export interface Progress {
  bottles: State;
  history: State[];
  /** Per bottle, how many layers from the bottom are still hidden (fog levels). */
  hidden: number[];
  hiddenHistory: number[][];
  moves: number;
  usedUndo: boolean;
  usedHint: boolean;
}

export interface Current {
  mode: Mode;
  /** Campaign level id; for the other modes the id shown in the title (streak for endless). */
  levelId: number;
  /** Generated board for daily, weekly and endless; null for campaign levels. */
  puzzle: Puzzle | null;
  /** Day key, week key or endless seed the board belongs to. */
  key: string;
  progress: Progress | null;
}

export interface Save {
  v: 2;
  /** Campaign level being played (1-based). */
  level: number;
  /** Highest campaign level the player may open. */
  unlocked: number;
  sound: boolean;
  allOpen: boolean;
  /** Campaign level id → fewest pours it was solved in. */
  best: Record<string, number>;
  current: Current | null;
  hints: { date: string; left: number };
  achievements: string[];
  stats: { solved: number; noUndo: number; noHint: number; hardPar: number; pours: number };
  daily: { results: Record<string, number>; streak: number; last: string };
  weekly: Record<string, number>;
  endless: { streak: number; best: number; seed: number };
}

const KEY = 'water-sort.save.v2';
const OLD_KEY = 'water-sort.save.v1';
export const HINTS_PER_DAY = 3;
export const HINTS_MAX = 9;

export const defaults = (): Save => ({
  v: 2,
  level: 1,
  unlocked: 1,
  sound: true,
  allOpen: false,
  best: {},
  current: null,
  hints: { date: '', left: HINTS_PER_DAY },
  achievements: [],
  stats: { solved: 0, noUndo: 0, noHint: 0, hardPar: 0, pours: 0 },
  daily: { results: {}, streak: 0, last: '' },
  weekly: {},
  endless: { streak: 0, best: 0, seed: 1 },
});

/** Fills in anything a stored save is missing, so older shapes keep working. */
function complete(raw: Partial<Save>): Save {
  const d = defaults();
  return {
    ...d,
    ...raw,
    v: 2,
    best: { ...d.best, ...raw.best },
    hints: { ...d.hints, ...raw.hints },
    stats: { ...d.stats, ...raw.stats },
    daily: { ...d.daily, ...raw.daily, results: { ...raw.daily?.results } },
    weekly: { ...raw.weekly },
    endless: { ...d.endless, ...raw.endless },
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
  };
}

// localStorage also backs the Capacitor WebView. Reads and writes can throw
// (private windows, blocked storage), so the game always works without it.
export function loadSave(): Save {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return complete(JSON.parse(raw));
    const old = localStorage.getItem(OLD_KEY);
    if (old) {
      // First save format: carry over progress and settings, drop the half-played board.
      const v1 = JSON.parse(old) as { level?: number; unlocked?: number; sound?: boolean; allOpen?: boolean };
      return complete({ level: v1.level, unlocked: v1.unlocked, sound: v1.sound, allOpen: v1.allOpen });
    }
  } catch {
    /* start fresh */
  }
  return defaults();
}

export function writeSave(s: Save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* progress lasts for this session only */
  }
}
