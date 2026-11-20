export interface Vec {
  x: number;
  y: number;
}

export const TAU = Math.PI * 2;

export const vec = (x = 0, y = 0): Vec => ({ x, y });

export const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export const vadd = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const vsub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const vscale = (a: Vec, s: number): Vec => ({ x: a.x * s, y: a.y * s });
export const vlen = (a: Vec): number => Math.hypot(a.x, a.y);
export const vlenSq = (a: Vec): number => a.x * a.x + a.y * a.y;
export const vdist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);

export function vnorm(a: Vec): Vec {
  const l = Math.hypot(a.x, a.y);
  return l < 1e-6 ? { x: 0, y: 0 } : { x: a.x / l, y: a.y / l };
}

/** Signed area (positive when counter-clockwise). */
export function polySignedArea(p: readonly Vec[]): number {
  let a = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const q = p[i];
    const r = p[(i + 1) % n];
    a += q.x * r.y - r.x * q.y;
  }
  return a / 2;
}

export function polyArea(p: readonly Vec[]): number {
  return Math.abs(polySignedArea(p));
}

export function polyPerimeter(p: readonly Vec[]): number {
  let l = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    l += vdist(p[i], p[(i + 1) % n]);
  }
  return l;
}

export function polyCentroid(p: readonly Vec[]): Vec {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const p0 = p[i];
    const p1 = p[(i + 1) % n];
    const f = p0.x * p1.y - p1.x * p0.y;
    a += f;
    cx += (p0.x + p1.x) * f;
    cy += (p0.y + p1.y) * f;
  }
  if (Math.abs(a) < 1e-6) {
    let sx = 0;
    let sy = 0;
    for (const q of p) {
      sx += q.x;
      sy += q.y;
    }
    return { x: sx / p.length, y: sy / p.length };
  }
  a *= 0.5;
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

export function convexHull(points: readonly Vec[]): Vec[] {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const pts = points.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: Vec, a: Vec, b: Vec): number => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Vec[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Vec[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  const hull = lower.concat(upper);
  return hull.length >= 3 ? hull : pts;
}

export function pointInPolygon(p: Vec, poly: readonly Vec[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    const intersects = a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

export function closestPointOnSegment(p: Vec, a: Vec, b: Vec): Vec {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-9) return { x: a.x, y: a.y };
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq, 0, 1);
  return { x: a.x + abx * t, y: a.y + aby * t };
}

export function distToSegmentSq(p: Vec, a: Vec, b: Vec): number {
  const q = closestPointOnSegment(p, a, b);
  const dx = p.x - q.x;
  const dy = p.y - q.y;
  return dx * dx + dy * dy;
}

/** Ramer-Douglas-Peucker simplification of an open polyline. */
export function simplify(points: readonly Vec[], eps: number): Vec[] {
  if (points.length < 3) return points.map((p) => ({ x: p.x, y: p.y }));
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const epsSq = eps * eps;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [s, e] = stack.pop() as [number, number];
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i++) {
      const d = distToSegmentSq(points[i], points[s], points[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > epsSq && idx > 0) {
      keep[idx] = 1;
      stack.push([s, idx], [idx, e]);
    }
  }

  const out: Vec[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keep[i]) out.push({ x: points[i].x, y: points[i].y });
  }
  return out;
}

/**
 * Resample a closed polygon so that every vertex is evenly spaced along the perimeter.
 * Always returns at most `count` vertices.
 */
export function resampleClosed(points: readonly Vec[], count: number): Vec[] {
  const m = points.length;
  if (m < 3) return points.map((p) => ({ x: p.x, y: p.y }));

  const segLen: number[] = [];
  let total = 0;
  for (let i = 0; i < m; i++) {
    const l = vdist(points[i], points[(i + 1) % m]);
    segLen.push(l);
    total += l;
  }
  if (total < 1e-6) return points.map((p) => ({ x: p.x, y: p.y }));

  const step = total / count;
  const out: Vec[] = [];
  let acc = 0;
  let cursor = 0;

  for (let i = 0; i < m && out.length < count; i++) {
    const l = segLen[i];
    const a = points[i];
    const b = points[(i + 1) % m];
    if (l < 1e-9) {
      cursor += l;
      continue;
    }
    while (acc < cursor + l && out.length < count) {
      const t = (acc - cursor) / l;
      out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) });
      acc += step;
    }
    cursor += l;
  }

  return out.length >= 3 ? out : points.map((p) => ({ x: p.x, y: p.y }));
}
