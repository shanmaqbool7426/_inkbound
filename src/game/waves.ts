import { Rng } from '../core/rng';
import type { EnemyKind } from './enemy';

export const RUN_SECONDS = 60;

/** Nine waves over the minute, then a final surge in the last ten seconds. */
export const WAVE_STARTS = [0, 7, 14, 21, 28, 35, 42, 48, 54, 60];
export const WAVE_COUNT = 9;
export const SURGE_START = RUN_SECONDS - 10;

export interface ScheduledSpawn {
  t: number;
  kind: EnemyKind;
  edge: number;
  pos: number;
}

type WaveSpec = Array<{ kind: EnemyKind; count: number }>;

const WAVES: WaveSpec[] = [
  // 1-2 · SEEKER only
  [{ kind: 'seeker', count: 8 }],
  [{ kind: 'seeker', count: 11 }],
  // 3-4 · SPLITTER joins
  [
    { kind: 'seeker', count: 8 },
    { kind: 'splitter', count: 3 },
  ],
  [
    { kind: 'seeker', count: 8 },
    { kind: 'splitter', count: 5 },
  ],
  // 5-6 · LANCER joins
  [
    { kind: 'seeker', count: 6 },
    { kind: 'lancer', count: 2 },
  ],
  [
    { kind: 'seeker', count: 8 },
    { kind: 'splitter', count: 4 },
    { kind: 'lancer', count: 3 },
  ],
  // 7-9 · BLOOMER joins, everything mixes
  [
    { kind: 'seeker', count: 6 },
    { kind: 'splitter', count: 3 },
    { kind: 'bloomer', count: 2 },
  ],
  [
    { kind: 'seeker', count: 8 },
    { kind: 'lancer', count: 3 },
    { kind: 'bloomer', count: 3 },
  ],
  [
    { kind: 'seeker', count: 10 },
    { kind: 'splitter', count: 5 },
    { kind: 'lancer', count: 3 },
    { kind: 'bloomer', count: 3 },
  ],
];

/** Final surge: an extra steady stream on top of wave nine. */
const SURGE: { kind: EnemyKind; perSecond: number }[] = [
  { kind: 'seeker', perSecond: 1.6 },
  { kind: 'lancer', perSecond: 0.12 },
];

/** 1-based wave index for a given elapsed time. */
export function waveIndexAt(t: number): number {
  for (let i = WAVE_COUNT; i >= 1; i--) {
    if (t >= WAVE_STARTS[i - 1]) return i;
  }
  return 1;
}

/** True during the closing surge. */
export function inSurge(t: number): boolean {
  return t >= SURGE_START;
}

/**
 * Spawn schedule is a pure function of the seed label, so every player on the
 * same daily seed faces exactly the same run.
 */
export function buildSchedule(seedLabel: string): ScheduledSpawn[] {
  const rng = new Rng(`waves3:${seedLabel}`);
  const out: ScheduledSpawn[] = [];

  WAVES.forEach((spec, waveIdx) => {
    const start = WAVE_STARTS[waveIdx];
    const end = WAVE_STARTS[waveIdx + 1];
    const span = end - start;

    const list: EnemyKind[] = [];
    for (const entry of spec) {
      for (let i = 0; i < entry.count; i++) list.push(entry.kind);
    }
    for (let i = list.length - 1; i > 0; i--) {
      const j = rng.int(0, i);
      const tmp = list[i];
      list[i] = list[j];
      list[j] = tmp;
    }

    list.forEach((kind, i) => {
      const at = start + ((i + rng.range(0, 0.8)) / list.length) * span * 0.92;
      out.push({
        t: Math.min(end - 0.3, at),
        kind,
        edge: rng.int(0, 3),
        pos: rng.range(0.08, 0.92),
      });
    });
  });

  // Final surge stream.
  const surgeSpan = RUN_SECONDS - SURGE_START - 0.4;
  for (const s of SURGE) {
    const total = Math.round(s.perSecond * surgeSpan);
    for (let i = 0; i < total; i++) {
      out.push({
        t: SURGE_START + (i / total) * surgeSpan + rng.range(0, 0.25),
        kind: s.kind,
        edge: rng.int(0, 3),
        pos: rng.range(0.08, 0.92),
      });
    }
  }

  out.sort((a, b) => a.t - b.t);
  return out;
}

export function spawnPoint(edge: number, pos: number, w: number, h: number, margin = 26): { x: number; y: number } {
  switch (edge % 4) {
    case 0:
      return { x: w * pos, y: margin };
    case 1:
      return { x: w - margin, y: h * pos };
    case 2:
      return { x: w * pos, y: h - margin };
    default:
      return { x: margin, y: h * pos };
  }
}
