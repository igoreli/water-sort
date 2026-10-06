// Minimal promise-based tweens driven by the Pixi ticker.
type Ease = (x: number) => number;
interface Tw {
  t: number;
  d: number;
  fn: (k: number) => void;
  ease: Ease;
  done: () => void;
}

const active: Tw[] = [];
const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const reducedMotion = reduced;

export const linear: Ease = (x) => x;
export const easeInOut: Ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
export const easeOut: Ease = (x) => 1 - Math.pow(1 - x, 3);
export const easeOutBack: Ease = (x) => 1 + 2.2 * Math.pow(x - 1, 3) + 1.2 * Math.pow(x - 1, 2);

export function tween(ms: number, fn: (k: number) => void, ease: Ease = easeInOut): Promise<void> {
  return new Promise((done) => {
    active.push({ t: 0, d: reduced ? Math.min(ms, 1) : ms, fn, ease, done });
  });
}

export const wait = (ms: number) => tween(ms, () => {});

export function tickTweens(dtMs: number) {
  for (let i = active.length - 1; i >= 0; i--) {
    const tw = active[i];
    tw.t += dtMs;
    const x = tw.d <= 0 ? 1 : Math.min(1, tw.t / tw.d);
    try {
      tw.fn(tw.ease(x));
    } catch {
      // The target was destroyed mid-animation (a new board was loaded). Drop the tween, keep the ticker alive.
      active.splice(i, 1);
      tw.done();
      continue;
    }
    if (x >= 1) {
      active.splice(i, 1);
      tw.done();
    }
  }
}
