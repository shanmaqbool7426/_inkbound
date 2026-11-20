import type { Vec } from '../core/math';
import { outlineRadius } from './anatomy';
import { paintPaper } from './paper';

export interface CardData {
  outline: Vec[];
  score: number;
  kills: number;
  survivedSeconds: number;
  grade: string;
  seed: string;
  arenaName: string;
  best: boolean;
}

const FONT = '-apple-system, BlinkMacSystemFont, "Segoe UI", Arial, sans-serif';

/** Draw the beast centred at (cx, cy), normalised to `targetRadius`. */
export function drawPortrait(
  ctx: CanvasRenderingContext2D,
  outline: readonly Vec[],
  cx: number,
  cy: number,
  targetRadius: number,
  glow = true,
): void {
  if (outline.length < 3) return;
  const r = outlineRadius(outline) || 1;
  const s = targetRadius / r;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  ctx.beginPath();
  ctx.moveTo(outline[0].x, outline[0].y);
  for (let i = 1; i < outline.length; i++) ctx.lineTo(outline[i].x, outline[i].y);
  ctx.closePath();

  const g = ctx.createLinearGradient(0, -r, 0, r);
  g.addColorStop(0, '#b06bff');
  g.addColorStop(0.55, '#7a2fc0');
  g.addColorStop(1, '#4a1a7a');
  ctx.fillStyle = g;
  if (glow) {
    ctx.shadowColor = 'rgba(120, 50, 200, 0.55)';
    ctx.shadowBlur = 18 / s * 0.6;
  }
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#1d0f2e';
  ctx.lineWidth = 5 / s;
  ctx.lineJoin = 'round';
  ctx.stroke();

  const eyeR = targetRadius * 0.19 / s;
  const sep = targetRadius * 0.33 / s;
  const fwd = targetRadius * 0.1 / s;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(sign * sep, fwd, eyeR, eyeR * 0.82, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#f6efff';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(sign * sep, fwd + eyeR * 0.22, eyeR * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = '#1d0f2e';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sign * sep - eyeR * 0.9 * sign, fwd - eyeR * 0.75);
    ctx.lineTo(sign * sep + eyeR * 0.9 * sign, fwd - eyeR * 0.4);
    ctx.strokeStyle = '#1d0f2e';
    ctx.lineWidth = 2.4 / s;
    ctx.stroke();
  }

  ctx.restore();
}

function splat(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
  for (let i = 0; i < 5; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = size * (1.6 + Math.random() * 1.8);
    ctx.beginPath();
    ctx.arc(x + Math.cos(a) * d, y + Math.sin(a) * d, size * (0.2 + Math.random() * 0.35), 0, Math.PI * 2);
    ctx.fill();
  }
}

/** Render the share card into an existing square canvas context. */
export function drawCard(ctx: CanvasRenderingContext2D, data: CardData): void {
  const S = ctx.canvas.width;
  const ink = '#241436';

  paintPaper(ctx, S, S);
  ctx.fillStyle = 'rgba(90, 30, 150, 0.10)';
  splat(ctx, S * 0.78, S * 0.2, S * 0.03, 'rgba(90, 30, 150, 0.10)');
  splat(ctx, S * 0.2, S * 0.72, S * 0.022, 'rgba(90, 30, 150, 0.10)');

  ctx.strokeStyle = ink;
  ctx.lineWidth = S * 0.008;
  ctx.strokeRect(S * 0.035, S * 0.035, S * 0.93, S * 0.93);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  ctx.save();
  ctx.translate(S * 0.11, S * 0.11);
  ctx.rotate(-0.04);
  ctx.fillStyle = ink;
  ctx.font = `italic 900 ${S * 0.085}px ${FONT}`;
  ctx.fillText('INKBOUND', 0, 0);
  ctx.fillStyle = 'rgba(36,20,54,0.65)';
  ctx.font = `800 ${S * 0.026}px ${FONT}`;
  ctx.fillText('MY BEAST', S * 0.012, S * 0.055);
  ctx.restore();

  drawPortrait(ctx, data.outline, S * 0.36, S * 0.45, S * 0.19);

  // Stat rows
  const rows: Array<[string, string]> = [
    ['\u23F1', `${data.survivedSeconds.toFixed(1)}s`],
    ['\u2694', `${data.kills}`],
    ['\u2605', `${data.score.toLocaleString('en-US')}`],
  ];
  rows.forEach((row, i) => {
    const y = S * 0.3 + i * S * 0.085;
    ctx.fillStyle = ink;
    ctx.font = `900 ${S * 0.044}px ${FONT}`;
    ctx.fillText(row[0], S * 0.68, y);
    ctx.font = `900 ${S * 0.05}px ${FONT}`;
    ctx.fillText(row[1], S * 0.735, y);
  });

  // Grade badge
  const gx = S * 0.79;
  const gy = S * 0.63;
  ctx.save();
  ctx.translate(gx, gy);
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const rr = i % 2 === 0 ? S * 0.085 : S * 0.062;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#f5c445';
  ctx.fill();
  ctx.strokeStyle = ink;
  ctx.lineWidth = S * 0.006;
  ctx.stroke();
  ctx.fillStyle = ink;
  ctx.textAlign = 'center';
  ctx.font = `italic 900 ${S * 0.075}px ${FONT}`;
  ctx.fillText(data.grade, 0, S * 0.004);
  ctx.restore();

  // Footer
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(36,20,54,0.75)';
  ctx.font = `800 ${S * 0.026}px ${FONT}`;
  ctx.fillText(`${data.arenaName.toUpperCase()}  ·  SEED ${data.seed}`, S * 0.5, S * 0.86);
  ctx.font = `italic 900 ${S * 0.032}px ${FONT}`;
  ctx.fillStyle = ink;
  ctx.fillText(data.best ? 'NEW BEST — DRAW YOUR OWN' : 'DRAW YOUR OWN', S * 0.5, S * 0.92);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (canvas.toBlob) canvas.toBlob((b) => resolve(b), 'image/png');
    else resolve(null);
  });
}

export function downloadCard(source: HTMLCanvasElement, seed: string): void {
  const big = document.createElement('canvas');
  big.width = 1080;
  big.height = 1080;
  const g = big.getContext('2d');
  if (!g) return;
  g.imageSmoothingQuality = 'high';
  g.drawImage(source, 0, 0, 1080, 1080);
  void canvasToBlob(big).then((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inkbound-${seed}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  });
}
