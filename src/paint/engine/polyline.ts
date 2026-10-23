/**
 * Stroke polylines with smoothed normals, and selection of the runs that touch a rectangle.
 * Translucent/textured brushes are repainted by regions: every time a point arrives, the
 * affected area is cleared and everything touching it is redrawn *in one go*, so the stroke
 * never builds up on itself.
 */
import type { Rect } from '../types';

export interface Polyline {
  xs: number[];
  ys: number[];
  /** Unit normal (perpendicular to the smoothed direction) at each point. Immutable once set. */
  nx: number[];
  ny: number[];
  /** Cumulative stroke length up to each point. */
  ds: number[];
  /** Bounding boxes of each block of CHUNK segments: [x0, y0, x1, y1] per block. */
  cb: number[];
}

/** Segments per block of the box index (to avoid walking very long strokes segment by segment). */
const CHUNK = 64;

export interface Run {
  line: Polyline;
  /** Start and end point indices (inclusive). i0 === i1 → isolated point. */
  i0: number;
  i1: number;
}

export class PolylineBuilder {
  readonly lines: Polyline[] = [];
  private cur: Polyline | null = null;
  private tx = 0;
  private ty = 0;
  private hasDir = false;
  private readonly minStep: number;
  private readonly smoothing: number;

  /** minStep: minimum distance between points; smoothing: weight of the previous direction (0..1). */
  constructor(minStep: number, smoothing = 0.55) {
    this.minStep = minStep;
    this.smoothing = smoothing;
  }

  start(x: number, y: number): void {
    this.cur = { xs: [x], ys: [y], nx: [0], ny: [1], ds: [0], cb: [] };
    this.lines.push(this.cur);
    this.hasDir = false;
  }

  get last(): { x: number; y: number } | null {
    const c = this.cur;
    if (!c) return null;
    const i = c.xs.length - 1;
    return { x: c.xs[i], y: c.ys[i] };
  }

  /** Adds a point; returns false if it is too close to the previous one. */
  add(x: number, y: number): boolean {
    const c = this.cur;
    if (!c) {
      this.start(x, y);
      return true;
    }
    const i = c.xs.length - 1;
    const dx = x - c.xs[i];
    const dy = y - c.ys[i];
    const d = Math.hypot(dx, dy);
    if (!(d >= this.minStep) || d === 0) return false;
    const ux = dx / d;
    const uy = dy / d;
    if (!this.hasDir) {
      this.tx = ux;
      this.ty = uy;
      this.hasDir = true;
      // The first point had no direction yet: give it the direction of the first segment.
      c.nx[i] = -uy;
      c.ny[i] = ux;
    } else {
      const k = this.smoothing;
      const tx = this.tx * k + ux * (1 - k);
      const ty = this.ty * k + uy * (1 - k);
      const tl = Math.hypot(tx, ty);
      if (tl > 1e-3) {
        this.tx = tx / tl;
        this.ty = ty / tl;
      } else {
        this.tx = ux;
        this.ty = uy;
      }
    }
    c.xs.push(x);
    c.ys.push(y);
    c.nx.push(-this.ty);
    c.ny.push(this.tx);
    c.ds.push(c.ds[i] + d);
    // Segment i → i + 1 belongs to block i / CHUNK.
    const k = 4 * Math.floor(i / CHUNK);
    const cb = c.cb;
    if (k === cb.length)
      cb.push(Math.min(x, c.xs[i]), Math.min(y, c.ys[i]), Math.max(x, c.xs[i]), Math.max(y, c.ys[i]));
    else {
      if (x < cb[k]) cb[k] = x;
      if (y < cb[k + 1]) cb[k + 1] = y;
      if (x > cb[k + 2]) cb[k + 2] = x;
      if (y > cb[k + 3]) cb[k + 3] = y;
    }
    return true;
  }
}

/** (Consecutive) runs of the polylines whose box, expanded by `pad`, touches the rectangle. */
export function runsInRect(lines: readonly Polyline[], r: Rect, pad: number): Run[] {
  const x0 = r.x - pad;
  const y0 = r.y - pad;
  const x1 = r.x + r.w + pad;
  const y1 = r.y + r.h + pad;
  const runs: Run[] = [];
  for (const line of lines) {
    const { xs, ys, cb } = line;
    const n = xs.length;
    if (n === 1) {
      if (xs[0] >= x0 && xs[0] <= x1 && ys[0] >= y0 && ys[0] <= y1) runs.push({ line, i0: 0, i1: 0 });
      continue;
    }
    let start = -1;
    for (let i = 0; i < n - 1; i++) {
      if (i % CHUNK === 0) {
        const k = (i / CHUNK) * 4;
        if (cb[k] > x1 || cb[k + 2] < x0 || cb[k + 1] > y1 || cb[k + 3] < y0) {
          // No segment in the block touches the rectangle.
          if (start >= 0) {
            runs.push({ line, i0: start, i1: i });
            start = -1;
          }
          i += CHUNK - 1;
          continue;
        }
      }
      const ax = xs[i];
      const bx = xs[i + 1];
      const ay = ys[i];
      const by = ys[i + 1];
      const hit =
        (ax < bx ? ax : bx) <= x1 &&
        (ax > bx ? ax : bx) >= x0 &&
        (ay < by ? ay : by) <= y1 &&
        (ay > by ? ay : by) >= y0;
      if (hit) {
        if (start < 0) start = i;
      } else if (start >= 0) {
        runs.push({ line, i0: start, i1: i });
        start = -1;
      }
    }
    if (start >= 0) runs.push({ line, i0: start, i1: n - 1 });
  }
  return runs;
}

/** Strokes (beginPath + subpaths) the runs, offset by `offset` px along the normal. */
export function traceRuns(ctx: CanvasRenderingContext2D, runs: readonly Run[], offset = 0): void {
  ctx.beginPath();
  for (const { line, i0, i1 } of runs) {
    const { xs, ys, nx, ny } = line;
    ctx.moveTo(xs[i0] + nx[i0] * offset, ys[i0] + ny[i0] * offset);
    if (i1 === i0) {
      // Isolated point: a tiny segment so the round cap draws a disc.
      ctx.lineTo(xs[i0] + nx[i0] * offset + 0.01, ys[i0] + ny[i0] * offset);
      continue;
    }
    for (let i = i0 + 1; i <= i1; i++) ctx.lineTo(xs[i] + nx[i] * offset, ys[i] + ny[i] * offset);
  }
}
