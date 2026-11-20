import type { Vec } from '../core/math';
import { outlineRadius } from './anatomy';

export interface Starter {
  id: string;
  name: string;
  points: Vec[];
}

function star(count: number, inner: number, outer: number, ears: boolean): Vec[] {
  const pts: Vec[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  if (ears) {
    pts.push({ x: -14, y: -outer * 1.5 });
    pts.push({ x: 14, y: -outer * 1.5 });
    pts.push({ x: 0, y: -outer * 0.4 });
  }
  return pts;
}

function fish(): Vec[] {
  const pts: Vec[] = [];
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = 64 - 18 * Math.abs(Math.sin(a * 2));
    pts.push({ x: Math.cos(a) * r * 1.1, y: Math.sin(a) * r * 0.85 });
  }
  pts.push({ x: -70, y: -22 });
  pts.push({ x: -52, y: 0 });
  pts.push({ x: -70, y: 22 });
  return pts;
}

function ghost(): Vec[] {
  const pts: Vec[] = [];
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    pts.push({ x: Math.cos(a) * 46, y: Math.sin(a) * 46 - 6 });
  }
  const waves = 4;
  for (let i = 0; i < waves; i++) {
    const x = 46 - (i / waves) * 92;
    pts.push({ x, y: 40 });
    pts.push({ x: x - 11, y: 54 });
    pts.push({ x: x - 23, y: 40 });
  }
  return pts;
}

const RAW: Starter[] = [
  { id: 'cat', name: 'Cat', points: star(16, 20, 44, true) },
  { id: 'fish', name: 'Fish', points: fish() },
  { id: 'ghost', name: 'Ghost', points: ghost() },
];

/** Full-size starter outlines — these become anatomy. */
export function starterShapes(): Starter[] {
  return RAW.map((s) => ({ id: s.id, name: s.name, points: s.points.map((p) => ({ x: p.x, y: p.y })) }));
}

/** Starter outlines scaled to fit `radius` — thumbnails only. */
export function starterOutlines(radius: number): Starter[] {
  return RAW.map((s) => {
    const r = outlineRadius(s.points) || 1;
    const k = radius / r;
    return { id: s.id, name: s.name, points: s.points.map((p) => ({ x: p.x * k, y: p.y * k })) };
  });
}

/**
 * The mascot on the title screen: a chunky spiked blob whose extremes are the
 * body itself (no thin ears), so it fills the canvas instead of being shrunk
 * by a single long spike.
 */
export function heroOutline(radius: number): Vec[] {
  const pts: Vec[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 - Math.PI / 2;
    const jag = i % 2 === 0 ? 1 : 0.62;
    const asym = 1 + Math.sin(i * 1.7) * 0.08;
    pts.push({ x: Math.cos(a) * radius * jag * asym, y: Math.sin(a) * radius * jag * asym });
  }
  return pts;
}
