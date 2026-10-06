// Daily, weekly and endless boards. Seeded from the calendar, so every player
// gets the same daily and weekly board without a server.
import { Modifier, MODIFIERS } from './chapters';
import { makePuzzle, Puzzle, rng } from './generator';

export type Mode = 'campaign' | 'daily' | 'weekly' | 'endless';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day, e.g. 2026-10-06. */
export function dayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function previousDayKey(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d - 1));
}

/** ISO week, e.g. 2026-W41. */
export function weekKey(d = new Date()): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${pad(week)}`;
}

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Human-readable day label from a day key: "6 Oct". */
export function dayLabel(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${d} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]}`;
}

export function dailyPuzzle(key = dayKey()): Puzzle {
  const rand = rng(hashSeed('daily:' + key));
  const colors = 6 + Math.floor(rand() * 3);
  return makePuzzle({ colors, spares: 2, mods: [] }, rand, 14);
}

export function weeklyModifier(key = weekKey()): Modifier {
  return MODIFIERS[hashSeed('weekly:' + key) % MODIFIERS.length];
}

export function weeklyPuzzle(key = weekKey()): Puzzle {
  const rand = rng(hashSeed('weekly:' + key));
  const colors = 7 + Math.floor(rand() * 2);
  return makePuzzle({ colors, spares: 2, mods: [weeklyModifier(key)] }, rand, 16);
}

/** Endless: colours grow with the streak, twists join in after the first few wins. */
export function endlessPuzzle(streak: number, seed: number): Puzzle {
  const rand = rng(hashSeed(`endless:${seed}:${streak}`));
  const colors = Math.min(11, 4 + Math.floor(streak / 2));
  const spares = streak >= 6 && streak % 4 === 3 ? 1 : 2;
  const mods: Modifier[] = [];
  if (streak >= 4 && rand() < 0.6) mods.push(MODIFIERS[Math.floor(rand() * MODIFIERS.length)]);
  if (streak >= 12 && rand() < 0.4) {
    const extra = MODIFIERS[Math.floor(rand() * MODIFIERS.length)];
    if (!mods.includes(extra) && !(extra === 'tall' && mods.includes('mixed')) && !(extra === 'mixed' && mods.includes('tall'))) mods.push(extra);
  }
  return makePuzzle({ colors, spares, mods }, rand, 6 + streak, 50_000);
}
