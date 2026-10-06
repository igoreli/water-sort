// Gentle synthesized sound effects (Web Audio). No audio files to ship.
import type { Liquid } from './core/chapters';

let ctx: AudioContext | null = null;
let enabled = true;
let liquid: Liquid = 'water';

function ac(): AudioContext | null {
  if (!enabled) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, at: number, len: number, gain: number, type: OscillatorType = 'sine', slideTo?: number) {
  const c = ac();
  if (!c) return;
  const t = c.currentTime + at;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + len);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g).connect(c.destination);
  o.start(t);
  o.stop(t + len + 0.02);
}

/** Filtered noise: the body of every pouring sound. */
function noise(len: number, type: BiquadFilterType, f0: number, f1: number, q: number, gain: number) {
  const c = ac();
  if (!c) return;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * len), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = type;
  filter.Q.value = q;
  const t = c.currentTime;
  filter.frequency.setValueAtTime(f0, t);
  filter.frequency.exponentialRampToValueAtTime(f1, t + len);
  const g = c.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.05);
  g.gain.setValueAtTime(gain, t + len - 0.08);
  g.gain.linearRampToValueAtTime(0, t + len);
  src.connect(filter).connect(g).connect(c.destination);
  src.start(t);
}

export const sfx = {
  setEnabled(on: boolean) {
    enabled = on;
  },
  setLiquid(kind: Liquid) {
    liquid = kind;
  },
  /** Call from a tap so browsers allow playback. */
  unlock() {
    ac();
  },
  select() {
    tone(620, 0, 0.09, 0.07, 'sine', 760);
  },
  drop() {
    tone(520, 0, 0.08, 0.05, 'sine', 420);
  },
  deny() {
    tone(170, 0, 0.12, 0.08, 'triangle', 120);
  },
  undo() {
    tone(560, 0, 0.1, 0.06, 'sine', 380);
  },
  /** Liquid filling a bottle. Each liquid has its own voice. */
  pour(layers: number) {
    const len = 0.17 + 0.15 * layers;
    switch (liquid) {
      case 'honey':
        noise(len * 1.7, 'bandpass', 260, 620, 3, 0.14);
        tone(140, 0, len * 1.7, 0.04, 'sine', 260);
        break;
      case 'lava':
        noise(len * 1.25, 'lowpass', 420, 900, 1, 0.18);
        tone(90, 0, len * 1.25, 0.05, 'triangle', 160);
        tone(1800, len * 0.5, 0.06, 0.02, 'square');
        break;
      case 'sand':
        noise(len * 0.9, 'highpass', 1800, 2600, 0.8, 0.09);
        break;
      case 'potion':
        noise(len, 'bandpass', 620, 1900, 2.5, 0.13);
        tone(1046, len * 0.3, 0.12, 0.03, 'sine', 1568);
        tone(300, 0, len, 0.03, 'sine', 620);
        break;
      default:
        noise(len, 'bandpass', 520, 1500, 2.2, 0.16);
        tone(300, 0, len, 0.035, 'sine', 620);
    }
  },
  sealed() {
    tone(784, 0, 0.22, 0.08, 'triangle');
    tone(1175, 0.08, 0.3, 0.07, 'triangle');
  },
  /** A padlock opening. */
  unlocked() {
    tone(440, 0, 0.06, 0.07, 'square', 520);
    tone(880, 0.07, 0.25, 0.07, 'triangle');
  },
  /** Out of pours. */
  fail() {
    tone(330, 0, 0.18, 0.07, 'triangle', 220);
    tone(220, 0.16, 0.3, 0.07, 'triangle', 150);
  },
  achievement() {
    [659, 880, 1319].forEach((f, i) => tone(f, i * 0.07, 0.35, 0.07, 'triangle'));
  },
  win() {
    [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, i * 0.09, 0.42, 0.08, 'triangle'));
  },
};
