// Chapters: ten levels each. The first ten are written by hand and introduce one twist each;
// the rest are built from them in rounds that rotate the twists, pair them up and keep the
// colour counts in the range the player has already met.
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
  /** Twists used by every level of the chapter (none, one or two); 'chaos' picks two per level. */
  mods: Modifier[] | 'chaos';
  /** Colours at the first and the last regular level. */
  colors: [number, number];
  theme: Theme;
  tip: string;
}

export const LEVELS_PER_CHAPTER = 10;
/** Hand-written chapters at the start; everything after them is derived. */
export const BASE_CHAPTERS = 10;
/** Derived rounds of ten chapters each. */
export const ROUNDS = 4;
export const TOTAL_CHAPTERS = BASE_CHAPTERS + ROUNDS * 10;
export const TOTAL_LEVELS = TOTAL_CHAPTERS * LEVELS_PER_CHAPTER;

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

/** Two twists can share a board unless both change bottle sizes. */
export function compatible(a: Modifier, b: Modifier): boolean {
  return a !== b && !((a === 'tall' && b === 'mixed') || (a === 'mixed' && b === 'tall'));
}

const T = (vessel: Vessel, liquid: Liquid, night: string, dusk: string, violet: string, deep: string): Theme => ({ vessel, liquid, night, dusk, violet, deep });

const BASE: Chapter[] = [
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

// ----- derived rounds -----------------------------------------------------
// Each round: a plain breather, six single twists, two pairs and a chaos finale.
// Over four rounds every twist comes back three times alone and twice in a pair.
// Colours stay where the base chapters left them, so the difficulty does not climb.

export const MAX_COLORS = 9;

/** Single-twist chapters, six per round, cycling through the twist list. */
function singlesOf(round: number): Modifier[] {
  return Array.from({ length: 6 }, (_, i) => MODIFIERS[(round * 6 + i) % MODIFIERS.length]);
}

/** Eight pairs, two per round; every twist sits in exactly two of them. */
const PAIRS: [Modifier, Modifier][] = [
  ['fog', 'labels'], ['tall', 'locks'],
  ['wild', 'thick'], ['mixed', 'limit'],
  ['fog', 'wild'], ['tall', 'limit'],
  ['labels', 'thick'], ['locks', 'mixed'],
];

const PLAIN_NAMES = ['Clear Springs', 'Still Pond', 'Glass Creek', 'Quiet Harbour'];
const CHAOS_NAMES = ['Carnival', 'Wild Brew', 'Storm Cellar', 'Grand Finale'];
const SINGLE_NAMES: Record<Modifier, string[]> = {
  fog: ['Morning Haze', 'Harbour Fog', 'Cloud Forest'],
  tall: ['Tower Tubes', 'Long Necks', 'Skyline'],
  labels: ['Night Shift', 'Inventory', 'Pharmacy'],
  locks: ['Strongroom', 'Iron Gate', 'Safe House'],
  wild: ['Moonshine', 'Opal Mist', 'Prism Pots'],
  thick: ['Syrup Shelf', 'Amber Jars', 'Molasses'],
  mixed: ['Odd Lots', 'Mismatched', 'Flea Market'],
  limit: ['Short Fuse', 'Last Drops', 'Ember Count'],
};
const PAIR_NAMES = ['Foggy Lab', 'Locked Towers', 'Sticky Rainbow', 'Odd Countdown', 'Pale Mist', 'Tall Order', 'Honey Labels', 'Jumble Vault'];

const baseOf = (m: Modifier): Chapter => BASE.find((c) => c.mods !== 'chaos' && c.mods[0] === m)!;

/** Colours for a twist after its first chapter: the upper half of its base range. */
function laterColors(m: Modifier): [number, number] {
  const top = Math.min(baseOf(m).colors[1], MAX_COLORS);
  return [top - 1, top];
}

function derivedChapters(): Chapter[] {
  const out: Chapter[] = [];
  const seen: Record<string, number> = {};
  const push = (name: string, mods: Modifier[] | 'chaos', colors: [number, number], theme: Theme, tip: string) => {
    const id = BASE_CHAPTERS + out.length + 1;
    out.push({ id, name, from: (id - 1) * LEVELS_PER_CHAPTER + 1, to: id * LEVELS_PER_CHAPTER, mods, colors, theme, tip });
  };
  const single = (m: Modifier) => {
    const n = seen[m] ?? 0;
    seen[m] = n + 1;
    push(SINGLE_NAMES[m][n], [m], laterColors(m), baseOf(m).theme, MODIFIER_TIP[m]);
  };
  const pair = (k: number) => {
    const [a, b] = PAIRS[k];
    push(PAIR_NAMES[k], [a, b].sort(), [6, 8], baseOf(a).theme, `Two twists: ${MODIFIER_NAME[a]} and ${MODIFIER_NAME[b]}.`);
  };
  for (let r = 0; r < ROUNDS; r++) {
    const singles = singlesOf(r);
    push(PLAIN_NAMES[r], [], [6, 8], BASE[0].theme, 'No twists. Just you and the bottles.');
    singles.slice(0, 3).forEach(single);
    pair(r * 2);
    singles.slice(3).forEach(single);
    pair(r * 2 + 1);
    push(CHAOS_NAMES[r], 'chaos', [7, 9], BASE[BASE_CHAPTERS - 1].theme, BASE[BASE_CHAPTERS - 1].tip);
  }
  return out;
}

export const CHAPTERS: Chapter[] = [...BASE, ...derivedChapters()];

export function chapterOf(levelId: number): Chapter {
  return CHAPTERS[Math.min(CHAPTERS.length - 1, Math.max(0, Math.ceil(levelId / LEVELS_PER_CHAPTER) - 1))];
}
