/** Internal utilities of the drawing engine (not part of the public API). */
import type { RGB, Rect } from '../types';

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export function smoothstep(e0: number, e1: number, v: number): number {
  const t = clamp((v - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

function channel(v: number): number {
  return clamp(Math.round(v), 0, 255);
}

/** Opaque (or translucent) CSS color from an RGB value. */
export function rgbCss(c: RGB, alpha = 1): string {
  const r = channel(c[0]);
  const g = channel(c[1]);
  const b = channel(c[2]);
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${clamp(alpha, 0, 1)})`;
}

/** Linear blend of two colors (t = 0 → a, t = 1 → b). */
export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function rgbKey(c: RGB): string {
  return `${channel(c[0])},${channel(c[1])},${channel(c[2])}`;
}

/** Bounding-rectangle accumulator for computing dirty areas. */
export class Bounds {
  minX = Infinity;
  minY = Infinity;
  maxX = -Infinity;
  maxY = -Infinity;

  reset(): void {
    this.minX = this.minY = Infinity;
    this.maxX = this.maxY = -Infinity;
  }

  /** Adds a point with a radius of influence. */
  add(x: number, y: number, r = 0): void {
    if (x - r < this.minX) this.minX = x - r;
    if (y - r < this.minY) this.minY = y - r;
    if (x + r > this.maxX) this.maxX = x + r;
    if (y + r > this.maxY) this.maxY = y + r;
  }

  get empty(): boolean {
    return !(this.maxX >= this.minX && this.maxY >= this.minY);
  }

  /** Integer rectangle containing everything added (or null if nothing was added). */
  toRect(): Rect | null {
    if (this.empty || !Number.isFinite(this.minX + this.minY + this.maxX + this.maxY)) return null;
    return intRect(this.minX, this.minY, this.maxX, this.maxY);
  }
}

/** Integer rectangle covering [x0, x1] × [y0, y1]. */
export function intRect(x0: number, y0: number, x1: number, y1: number): Rect {
  const x = Math.floor(x0);
  const y = Math.floor(y0);
  return { x, y, w: Math.max(1, Math.ceil(x1) - x), h: Math.max(1, Math.ceil(y1) - y) };
}

export function createCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function context2d(c: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = c.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D not available');
  return ctx;
}

/** Size-limited Map: when `max` is exceeded, the oldest entry is discarded. */
export class LimitedCache<V> {
  private readonly map = new Map<string, V>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max;
  }

  get(key: string, make: () => V): V {
    const hit = this.map.get(key);
    if (hit !== undefined) {
      // Refresh the entry's age.
      this.map.delete(key);
      this.map.set(key, hit);
      return hit;
    }
    const v = make();
    this.map.set(key, v);
    if (this.map.size > this.max) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    return v;
  }
}
