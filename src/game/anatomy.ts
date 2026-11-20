import type { Vec } from '../core/math';
import { clamp, convexHull, polyArea, polyCentroid, polyPerimeter } from '../core/math';

export const INK_BUDGET = 1200;
export const MAX_VERTS = 24;
export const MIN_AREA = 1500;
export const SIMPLIFY_EPS = 2.5;
export const STEP_PX = 3;

export type Trait = 'FRAGILE' | 'BULWARK' | 'HEAVY' | 'BALANCED' | 'BLADE' | 'DRIFTER';

export interface Stats {
  area: number;
  perimeter: number;
  thickness: number;
  spikiness: number;
  vertices: number;
  mass: number;
  health: number;
  attack: number;
  defense: number;
  /** Display speed, 3.2 .. 7.5 */
  speed: number;
  /** Internal pixels per second */
  speedPx: number;
  dashCooldown: number;
  radius: number;
  trait: Trait;
}

export interface Anatomy {
  outline: Vec[];
  hull: Vec[];
  stats: Stats;
}

/**
 * Turn a drawn (closed) polygon into a playable anatomy.
 * Oversized drawings are scaled down so they always fit the arena; stats are
 * derived from the normalised shape so the trade-offs stay honest.
 */
export function buildAnatomy(worldPoints: readonly Vec[], maxRadius: number): Anatomy | null {
  if (worldPoints.length < 3) return null;

  const centroid = polyCentroid(worldPoints);
  let outline = worldPoints.map((p) => ({ x: p.x - centroid.x, y: p.y - centroid.y }));

  let area = polyArea(outline);
  let perimeter = polyPerimeter(outline);
  if (area < MIN_AREA) return null;

  let radius = Math.sqrt(area / Math.PI);
  if (radius > maxRadius) {
    const s = maxRadius / radius;
    outline = outline.map((p) => ({ x: p.x * s, y: p.y * s }));
    area *= s * s;
    perimeter *= s;
    radius = maxRadius;
  }

  const thickness = (2 * area) / Math.max(perimeter, 1e-6);
  if (thickness < 4) return null;

  const hull = convexHull(outline);
  const stats = deriveStats(area, perimeter, thickness, radius, outline.length);
  return { outline, hull, stats };
}

function deriveStats(area: number, perimeter: number, thickness: number, radius: number, vertices: number): Stats {
  const rawSpike = (perimeter * perimeter) / (Math.max(area, 1) * 40); // circle ≈ 0.314
  const spikiness = clamp((rawSpike - 0.32) / 1.2, 0, 1);

  const sizeN = clamp(area / 26000, 0, 1);
  const thickN = clamp(thickness / 26, 0, 1);

  const mass = 0.4 + 2.6 * sizeN;
  const health = Math.round(60 + 260 * thickN);
  const attack = Math.round(8 + 48 * spikiness);
  const defense = Math.round(28 * thickN * (1 - 0.35 * spikiness));
  const speed = 3.2 + 4.3 * (1 - sizeN) - 0.6 * spikiness;
  const speedPx = speed * 34;
  const dashCooldown = 1.6 - 0.6 * sizeN;

  let trait: Trait = 'BALANCED';
  if (thickN > 0.6 && spikiness < 0.35) trait = 'BULWARK';
  else if (spikiness > 0.72) trait = 'BLADE';
  else if (spikiness > 0.5 && thickN < 0.4) trait = 'FRAGILE';
  else if (sizeN > 0.65) trait = 'HEAVY';
  else if (sizeN < 0.22) trait = 'DRIFTER';

  return {
    area: Math.round(area),
    perimeter: Math.round(perimeter),
    thickness: Math.round(thickness * 10) / 10,
    spikiness,
    vertices,
    mass,
    health,
    attack,
    defense,
    speed: Math.round(Math.max(2.8, speed) * 10) / 10,
    speedPx,
    dashCooldown: Math.round(dashCooldown * 10) / 10,
    radius,
    trait,
  };
}

export interface StatRow {
  icon: string;
  label: string;
  value: string;
  accent: boolean;
}

export function mainStatRows(stats: Stats): StatRow[] {
  return [
    { icon: '\u2665', label: 'HEALTH', value: String(stats.health), accent: false },
    { icon: '\u2694', label: 'ATTACK', value: String(stats.attack), accent: true },
    { icon: '\u27A4', label: 'SPEED', value: stats.speed.toFixed(1), accent: false },
    { icon: '\u26E8', label: 'DEFENSE', value: String(stats.defense), accent: false },
    { icon: '\u26A1', label: 'DASH', value: `${stats.dashCooldown.toFixed(1)}s`, accent: false },
  ];
}

export interface BarDef {
  key: string;
  label: string;
  value: number;
  display: string;
  accent: boolean;
}

export function statBars(stats: Stats): BarDef[] {
  return [
    { key: 'hp', label: 'HEALTH', value: stats.health / 320, display: String(stats.health), accent: false },
    { key: 'atk', label: 'ATTACK', value: stats.attack / 56, display: String(stats.attack), accent: true },
    { key: 'spd', label: 'SPEED', value: (stats.speed - 3) / 4.5, display: stats.speed.toFixed(1), accent: false },
    { key: 'def', label: 'DEFENSE', value: stats.defense / 28, display: String(stats.defense), accent: false },
  ];
}

export function outlineRadius(points: readonly Vec[]): number {
  let max = 0;
  for (const p of points) max = Math.max(max, Math.hypot(p.x, p.y));
  return max;
}

/** Star rating for a finished run: 0..3 */
export function gradeFor(survived: boolean, score: number): { grade: string; stars: number } {
  if (survived && score >= 20000) return { grade: 'S', stars: 3 };
  if (survived) return { grade: 'A', stars: 2 };
  if (score >= 9000) return { grade: 'B', stars: 1 };
  return { grade: 'C', stars: 0 };
}
