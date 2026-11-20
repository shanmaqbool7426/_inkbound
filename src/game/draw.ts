import type { Vec } from '../core/math';
import { clamp, resampleClosed, simplify } from '../core/math';
import type { Anatomy } from './anatomy';
import { INK_BUDGET, MAX_VERTS, SIMPLIFY_EPS, STEP_PX, buildAnatomy } from './anatomy';

export type DrawFailure = 'too-small' | 'no-shape';

export class StrokeSampler {
  points: Vec[] = [];
  length = 0;
  finished = false;

  private lastX = 0;
  private lastY = 0;
  private hasLast = false;

  get progress(): number {
    return clamp(this.length / INK_BUDGET, 0, 1);
  }

  get isDrawing(): boolean {
    return this.hasLast && !this.finished;
  }

  reset(): void {
    this.points.length = 0;
    this.length = 0;
    this.finished = false;
    this.hasLast = false;
  }

  begin(x: number, y: number): void {
    this.reset();
    this.points.push({ x, y });
    this.lastX = x;
    this.lastY = y;
    this.hasLast = true;
  }

  /** Append a pointer position, sub-stepping so capture density is stable. */
  push(x: number, y: number): void {
    if (this.finished || !this.hasLast) return;

    const dx = x - this.lastX;
    const dy = y - this.lastY;
    const d = Math.hypot(dx, dy);
    if (d < STEP_PX) return;

    const remaining = INK_BUDGET - this.length;
    if (d >= remaining) {
      const t = remaining / d;
      this.points.push({ x: this.lastX + dx * t, y: this.lastY + dy * t });
      this.length = INK_BUDGET;
      this.finished = true;
      return;
    }

    this.points.push({ x, y });
    this.length += d;
    this.lastX = x;
    this.lastY = y;
  }

  /** Close the stroke and hand back world-space vertices. */
  close(): Vec[] {
    this.hasLast = false;
    this.finished = true;
    const simplified = simplify(this.points, SIMPLIFY_EPS);
    return resampleClosed(simplified, MAX_VERTS);
  }
}

export function finaliseStroke(points: readonly Vec[], maxRadius: number): Anatomy | null {
  return buildAnatomy(points, maxRadius);
}

/** Live stroke preview: tapered so drawings look hand-inked. */
export function renderStroke(ctx: CanvasRenderingContext2D, pts: readonly Vec[], ink = '#111014'): void {
  if (pts.length < 2) {
    if (pts.length === 1) {
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, 4, 0, Math.PI * 2);
      ctx.fillStyle = ink;
      ctx.fill();
    }
    return;
  }

  const n = pts.length;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ink;

  // Draw in short runs so line width can taper along the stroke.
  const chunk = 6;
  for (let i = 0; i < n - 1; i += chunk - 1) {
    const end = Math.min(i + chunk - 1, n - 1);
    const t = i / (n - 1);
    ctx.lineWidth = 22 - 12 * t;
    ctx.beginPath();
    ctx.moveTo(pts[i].x, pts[i].y);
    for (let j = i + 1; j <= end; j++) ctx.lineTo(pts[j].x, pts[j].y);
    ctx.stroke();
  }
}

export function renderAnatomy(
  ctx: CanvasRenderingContext2D,
  outline: readonly Vec[],
  opts: { fill: string; stroke: string; lineWidth: number; scale?: number; alpha?: number },
): void {
  if (outline.length < 3) return;
  const s = opts.scale ?? 1;
  ctx.save();
  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.beginPath();
  ctx.moveTo(outline[0].x * s, outline[0].y * s);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x * s, outline[i].y * s);
  ctx.closePath();
  ctx.fillStyle = opts.fill;
  ctx.fill();
  ctx.lineWidth = opts.lineWidth;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = opts.stroke;
  ctx.stroke();
  ctx.restore();
}
