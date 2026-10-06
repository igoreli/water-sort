// Achievements are checked against the save after every win. Pure data + one function.
import { CHAPTERS, LEVELS_PER_CHAPTER } from './chapters';

export interface Achievement {
  id: string;
  name: string;
  text: string;
}

export const ACHIEVEMENTS: Achievement[] = [
  { id: 'first', name: 'First Pour', text: 'Sort your first level.' },
  { id: 'steady', name: 'Steady Hands', text: 'Sort 10 levels without using Undo.' },
  { id: 'unaided', name: 'No Help Needed', text: 'Sort 25 levels without a hint.' },
  { id: 'hard-par', name: 'Par Breaker', text: 'Finish a Hard level in par or fewer pours.' },
  { id: 'fog', name: 'Fog Walker', text: 'Finish every level of Misty Lake.' },
  { id: 'chapter-stars', name: 'Chapter Master', text: 'Three stars on every level of a chapter.' },
  { id: 'daily-7', name: 'Week Streak', text: 'Solve the daily board 7 days in a row.' },
  { id: 'endless-10', name: 'Marathon', text: 'Reach a streak of 10 in Endless.' },
  { id: 'hundred', name: 'The Hundredth', text: 'Sort level 100.' },
  { id: 'thousand', name: 'Thousand Pours', text: 'Make 1000 pours in total.' },
];

export interface AchievementInput {
  unlocked: string[];
  stats: { solved: number; noUndo: number; noHint: number; hardPar: number; pours: number };
  /** Campaign level id → stars earned (0 or missing when unsolved). */
  stars: Record<string, number>;
  dailyStreak: number;
  endlessBest: number;
}

/** Ids that became true now and were not unlocked before. */
export function newAchievements(a: AchievementInput): string[] {
  const done = new Set(a.unlocked);
  const out: string[] = [];
  const earn = (id: string, ok: boolean) => ok && !done.has(id) && out.push(id);
  earn('first', a.stats.solved >= 1);
  earn('steady', a.stats.noUndo >= 10);
  earn('unaided', a.stats.noHint >= 25);
  earn('hard-par', a.stats.hardPar >= 1);
  earn('fog', Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => a.stars[String(CHAPTERS[1].from + i)] ?? 0).every((s) => s > 0));
  earn(
    'chapter-stars',
    CHAPTERS.some((ch) => Array.from({ length: LEVELS_PER_CHAPTER }, (_, i) => a.stars[String(ch.from + i)] ?? 0).every((s) => s >= 3)),
  );
  earn('daily-7', a.dailyStreak >= 7);
  earn('endless-10', a.endlessBest >= 10);
  earn('hundred', (a.stars['100'] ?? 0) > 0);
  earn('thousand', a.stats.pours >= 1000);
  return out;
}

/** Stars for a campaign level: three at par or better, two within three pours, one for finishing. */
export function starsFor(moves: number, par: number): number {
  return moves <= par ? 3 : moves <= par + 3 ? 2 : 1;
}
