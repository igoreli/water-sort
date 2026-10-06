# Water Sort Puzzle

TypeScript + PixiJS 8, packaged for the stores with Capacitor. 100 levels in 10 chapters, each with a
verified solution, plus a daily board, a weekly challenge and an endless mode. The web build is an
installable PWA that works offline.

Play: https://igoreli.github.io/water-sort/

## Commands

| Command | What it does |
| --- | --- |
| `npm install` | install dependencies |
| `npm run dev` | local dev server (Vite) |
| `npm run build` | type-check, web build into `dist/`, then the service worker is written |
| `npm test` | rule, mode and achievement tests, then solves and replays all 100 levels |
| `npm run levels` | regenerate `src/core/levels.json` (about a minute) |
| `npm run build:single` | the whole game as one HTML file in `dist-single/` (PixiJS from a CDN) |
| `npm run test:e2e` | plays levels and modes in a real browser by clicking (needs Chromium and a server on `dist-single`, port 4173) |

## Layout

- `src/core/game.ts` — rules: pour, win, stuck. Takes a `Rules` object (capacity, labels, locks, whole-run pours). No graphics.
- `src/core/chapters.ts` — chapters: twist, colour range, theme colours, vessel shape, liquid, tutorial tip.
- `src/core/solver.ts` — weighted A*: verifies levels and powers hints.
- `src/core/generator.ts` — board generation with modifiers and the difficulty rating.
- `src/core/modes.ts` — daily, weekly and endless boards (seeded from the calendar, no server needed).
- `src/core/achievements.ts` — achievements and stars.
- `src/core/levels.json` — generated levels (never edit by hand).
- `src/view/` — PixiJS: four vessel shapes, liquid, fog, wild layers, labels, padlocks, the pour animation, effects.
- `src/main.ts` — game controller, modes and menu; `src/audio.ts` — sound (each liquid has its own voice); `src/storage.ts` — saving.

## Chapters and twists

| Chapter | Levels | Twist |
| --- | --- | --- |
| 1 Spring Water | 1–10 | the classic rules |
| 2 Misty Lake | 11–20 | fog: only the top layer is visible |
| 3 Tall Tubes | 21–30 | tubes hold five layers |
| 4 The Lab | 31–40 | label: a bottle accepts one colour only |
| 5 The Vault | 41–50 | lock: a bottle opens once the colour on its padlock is finished |
| 6 Rainbow Potion | 51–60 | wild: the pale layer joins any colour |
| 7 Honey Pots | 61–70 | thick liquid: the whole run pours or nothing does |
| 8 Odd Jars | 71–80 | jars of different sizes |
| 9 Lava Rush | 81–90 | pour limit: par + 3 |
| 10 Grand Mix | 91–100 | two random twists per level |

Every fifth level from 15 is "Hard": one spare bottle (the locks chapter keeps two and adds a colour).

## Difficulty

Level rating = solution length × (1 + 2 × share of no-lookahead playouts that get stuck).
Within each group, levels ascend by the rating.

## Progress and saving

Everything lives in `localStorage` under the key `water-sort.save.v2` (unlocked levels and settings migrate
from `v1`): stars per level (3 at par, 2 up to par + 3, 1 for finishing), the current board of any mode with
its history, hints (3 a day, +1 for the first three-star finish of a level, at most 9), daily results and
streak, weekly results, endless streak and best, achievements and statistics.

## Web version and installing on a phone

The `dist/` build is a PWA: manifest, icons, bundled fonts and a service worker, so the game opens without
a network. Publishing to GitHub Pages is automatic: `.github/workflows/pages.yml` runs the tests, builds and
deploys `dist/` on every push to `main`. The address is `https://<user>.github.io/<repository>/`.

On an iPhone: open the address in Safari → Share → "Add to Home Screen". On Android, Chrome offers to
install on its own.

## Store builds

1. Replace `appId` in `capacitor.config.ts` with your own (it cannot change after the first release).
2. `npm run build`
3. `npx cap add ios` and/or `npx cap add android` (once), then `npm run cap:sync`.
4. `npx cap open ios` (needs a Mac with Xcode) or `npx cap open android` (Android Studio).

Still to do before a release: splash screens and icons for the native projects (the PWA icons are in
`public/icons`), and optionally saving through `@capacitor/preferences` instead of `localStorage`.
