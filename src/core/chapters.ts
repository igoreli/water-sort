// Chapters: ten levels each, every chapter introduces one twist and brings its own look.
// Pure data — shared by the level generator (Node) and the game (browser).

export type Modifier = 'fog' | 'tall' | 'labels' | 'locks' | 'wild' | 'thick' | 'mixed' | 'limit';
export type Vessel = 'bottle' | 'tube' | 'flask' | 'jar';
export type Liquid = 'water' | 'honey' | 'lava' | 'sand' | 'potion';

export interface Theme {
  vessel: Vessel;
  liquid: Liquid;
  /** Background, glow, dock and dock-shadow colours (CSS). */
  night: string;
  dusk: string;
  violet: string;
  deep: string;
}

export interface Chapter {
  id: number;
  name: string;
  /** First and last level id. */
  from: number;
  to: number;
  /** Twist used by every level of the chapter; 'chaos' picks two per level. */
  mods: Modifier[] | 'chaos';
  /** Colours at the first and the last regular level. */
  colors: [number, number];
  theme: Theme;
  tip: string;
}

export const LEVELS_PER_CHAPTER = 10;
export const TOTAL_LEVELS = 100;

export const MODIFIERS: Modifier[] = ['fog', 'tall', 'labels', 'locks', 'wild', 'thick', 'mixed', 'limit'];

export const MODIFIER_NAME: Record<Modifier, string> = {
  fog: 'Fog',
  tall: 'Tall',
  labels: 'Labels',
  locks: 'Locks',
  wild: 'Wild',
  thick: 'Thick',
  mixed: 'Odd sizes',
  limit: 'Limit',
};

export const MODIFIER_TIP: Record<Modifier, string> = {
  fog: 'Fog: only the top layer shows. Pour to reveal what is underneath.',
  tall: 'Tall bottles hold five layers. A colour needs all five to finish.',
  labels: 'A labelled bottle takes its own colour only.',
  locks: 'A locked bottle opens once the colour on its padlock is finished.',
  wild: 'The pale layer is wild: it joins any colour it sits with.',
  thick: 'Thick liquid pours as a whole run. If it does not fit, it stays.',
  mixed: 'Bottles come in sizes. Each colour fits exactly one size.',
  limit: 'Only so many pours. Plan before you tilt.',
};

const T = (vessel: Vessel, liquid: Liquid, night: string, dusk: string, violet: string, deep: string): Theme => ({ vessel, liquid, night, dusk, violet, deep });

export const CHAPTERS: Chapter[] = [
  { id: 1, name: 'Spring Water', from: 1, to: 10, mods: [], colors: [3, 5], theme: T('bottle', 'water', '#130b3a', '#2b1a7a', '#6a1de8', '#4a10b4'), tip: 'Tap a bottle, then tap another to pour.' },
  { id: 2, name: 'Misty Lake', from: 11, to: 20, mods: ['fog'], colors: [4, 6], theme: T('bottle', 'water', '#0d1f33', '#1f4a66', '#2a7fb8', '#1c5a86'), tip: MODIFIER_TIP.fog },
  { id: 3, name: 'Tall Tubes', from: 21, to: 30, mods: ['tall'], colors: [4, 6], theme: T('tube', 'water', '#0f2a24', '#1d5a4c', '#1f9e7a', '#157256'), tip: MODIFIER_TIP.tall },
  { id: 4, name: 'The Lab', from: 31, to: 40, mods: ['labels'], colors: [5, 7], theme: T('flask', 'potion', '#241038', '#4a1d6e', '#9a3bd6', '#6f2a9c'), tip: MODIFIER_TIP.labels },
  { id: 5, name: 'The Vault', from: 41, to: 50, mods: ['locks'], colors: [5, 7], theme: T('jar', 'water', '#2a1a0c', '#5a3a14', '#b8761c', '#86551a'), tip: MODIFIER_TIP.locks },
  { id: 6, name: 'Rainbow Potion', from: 51, to: 60, mods: ['wild'], colors: [6, 8], theme: T('flask', 'potion', '#2a0b33', '#5f1f6e', '#c93aa6', '#8f2878'), tip: MODIFIER_TIP.wild },
  { id: 7, name: 'Honey Pots', from: 61, to: 70, mods: ['thick'], colors: [6, 8], theme: T('jar', 'honey', '#2e1d05', '#6b4a0c', '#d89a1c', '#a06f14'), tip: MODIFIER_TIP.thick },
  { id: 8, name: 'Odd Jars', from: 71, to: 80, mods: ['mixed'], colors: [6, 8], theme: T('jar', 'sand', '#1f2430', '#3f4a66', '#6b7fb3', '#4d5d8a'), tip: MODIFIER_TIP.mixed },
  { id: 9, name: 'Lava Rush', from: 81, to: 90, mods: ['limit'], colors: [7, 9], theme: T('tube', 'lava', '#2b0a0a', '#6b1a12', '#e0462a', '#a8321e'), tip: MODIFIER_TIP.limit },
  { id: 10, name: 'Grand Mix', from: 91, to: 100, mods: 'chaos', colors: [7, 9], theme: T('bottle', 'potion', '#0b0b1f', '#2a1a5a', '#7a3be8', '#5428b0'), tip: 'Anything goes: two twists per level. Read the badges.' },
];

export function chapterOf(levelId: number): Chapter {
  return CHAPTERS[Math.min(CHAPTERS.length - 1, Math.max(0, Math.ceil(levelId / LEVELS_PER_CHAPTER) - 1))];
}
