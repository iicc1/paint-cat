/**
 * Engine for the 9 artistic brushes and for the outline/fill styles of shapes.
 *
 * Techniques (all textures are procedural and deterministic given the seed):
 * - brush: pre-rendered round stamps (soft, irregular edge, 6 variants) every ≤18 % of the size.
 * - calligraphy1/2: flat nib at ±45°; the convex hull between consecutive positions is filled.
 * - airbrush: uniform 1 px dots in a circle (while held down and along the path).
 * - oil / crayon / naturalPencil / marker / watercolor: region repainting (see engine/polyline.ts): the
 *   area affected by each new point is cleared and everything touching it is redrawn in a single pass,
 *   so the stroke never builds up on itself or leaves "beads" at the joins.
 *   - oil: opaque body + ~0.8 bristles/px grouped by tone (5 tones) that wiggle and "dry out" on long
 *     strokes; round loading dab at the start.
 *   - crayon / naturalPencil: concentric bands (dense core, sparse edge) × periodic paper grain
 *     anchored to the document (source-in), so overlapping strokes reinforce the same grain.
 *   - marker: flat color with a soft edge (bands), translucent via layerAlpha.
 *   - watercolor: blurred edge, interior slightly lighter than the edge, fine streaks along the stroke
 *     and paper blotches anchored to the document; translucent via layerAlpha.
 * - Textured fills: periodic 256 px tiles painted with the brush itself (a single operation).
 *
 * Requirements for the layer passed to beginBrushStroke: transparent at the start, dedicated to this stroke and
 * with the identity transform (1 unit = 1 document px): region brushes clear and repaint areas of
 * the layer. Marker and watercolor are translucent: the layer is composited once onto the
 * document with globalAlpha = layerAlpha.
 */
import type { BrushKind, Contour, RGB, Rect, ShapeStyle } from './types';
import { contoursToPath2D } from './shapes';
import { Bounds, LimitedCache, clamp, context2d, createCanvas, intRect, mixRgb, rgbCss, rgbKey } from './engine/util';
import { mulberry32, valueNoise1D } from './engine/random';
import { PolylineBuilder, runsInRect, traceRuns, type Polyline, type Run } from './engine/polyline';
import { grainPattern } from './engine/textures';

export interface BrushStroke {
  /** Continue the stroke to (x,y) (document pixel coords, may be fractional), painting into the layer ctx given at begin. Returns the dirty rect (integer, clipped to nothing — caller clips) or null. */
  lineTo(x: number, y: number): Rect | null;
  /** Called about every 30 ms while the button is held (pointer may be still). Airbrush keeps spraying here; other brushes return null. */
  hold(): Rect | null;
  /** Opacity the caller must use when compositing the layer onto the document (layer is drawn with ctx.globalAlpha = layerAlpha). 1 for opaque brushes. */
  readonly layerAlpha: number;
  /** Dirty rect of the first dab, painted by beginBrushStroke. */
  readonly initialDirty: Rect | null;
}

type SizeList = readonly [number, number, number, number];

function sizes(a: number, b: number, c: number, d: number): SizeList {
  return Object.freeze([a, b, c, d] as const);
}

/** Sizes of the "Size" dropdown for each brush (Paint's). */
export const BRUSH_SIZES: Readonly<Record<BrushKind, SizeList>> = Object.freeze({
  brush: sizes(1, 3, 5, 8),
  calligraphy1: sizes(3, 5, 8, 10),
  calligraphy2: sizes(3, 5, 8, 10),
  airbrush: sizes(4, 8, 16, 24),
  oil: sizes(8, 16, 30, 40),
  crayon: sizes(8, 16, 30, 40),
  marker: sizes(8, 16, 30, 40),
  naturalPencil: sizes(4, 6, 8, 10),
  watercolor: sizes(8, 16, 30, 40),
});

/** Default size of each brush (in px; always one of BRUSH_SIZES). */
export const BRUSH_DEFAULT_SIZE: Readonly<Record<BrushKind, number>> = Object.freeze({
  brush: 3,
  calligraphy1: 5,
  calligraphy2: 5,
  airbrush: 8,
  oil: 30,
  crayon: 30,
  marker: 30,
  naturalPencil: 4,
  watercolor: 30,
});

/** Layer compositing opacity (marker and watercolor are translucent). */
const LAYER_ALPHA = { marker: 0.55, watercolor: 0.5 } as const;

const TAU = Math.PI * 2;
const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function defaultSeed(x: number, y: number): number {
  return (Math.imul(Math.floor(x) | 0, 73856093) ^ Math.imul(Math.floor(y) | 0, 19349663) ^ 0x5eed) >>> 0;
}

// =============================================================================================
// Brush (stamps)

const BRUSH_VARIANTS = 6;
const brushStampCache = new LimitedCache<HTMLCanvasElement[]>(12);

function brushStamps(size: number, color: RGB): HTMLCanvasElement[] {
  return brushStampCache.get(`${size}|${rgbKey(color)}`, () => {
    const r = size / 2;
    const side = 2 * Math.ceil(r + 2) + 1; // odd: the center falls on a pixel center
    const c = side / 2;
    const soft = Math.max(0.9, size * 0.12);
    const amp = size >= 5 ? 0.05 : 0;
    const rng = mulberry32(0xb7a5);
    const out: HTMLCanvasElement[] = [];
    for (let v = 0; v < BRUSH_VARIANTS; v++) {
      const p1 = rng() * TAU;
      const p2 = rng() * TAU;
      const p3 = rng() * TAU;
      const canvas = createCanvas(side, side);
      const ctx = context2d(canvas);
      const img = ctx.createImageData(side, side);
      const d = img.data;
      for (let y = 0; y < side; y++) {
        for (let x = 0; x < side; x++) {
          const dx = x + 0.5 - c;
          const dy = y + 0.5 - c;
          const th = Math.atan2(dy, dx);
          const edge =
            r * (1 + amp * (0.5 * Math.sin(3 * th + p1) + 0.3 * Math.sin(5 * th + p2) + 0.2 * Math.sin(9 * th + p3)));
          const a = clamp((edge - Math.hypot(dx, dy)) / soft + 0.5, 0, 1);
          const j = (y * side + x) * 4;
          d[j] = color[0];
          d[j + 1] = color[1];
          d[j + 2] = color[2];
          d[j + 3] = Math.round(a * 255);
        }
      }
      ctx.putImageData(img, 0, 0);
      out.push(canvas);
    }
    return out;
  });
}

class StampBrushStroke implements BrushStroke {
  readonly layerAlpha = 1;
  readonly initialDirty: Rect | null;
  private readonly layer: CanvasRenderingContext2D;
  private readonly stamps: HTMLCanvasElement[];
  private readonly half: number;
  private readonly spacing: number;
  private readonly rng: () => number;
  private readonly bounds = new Bounds();
  private x: number;
  private y: number;
  /** Distance traveled since the last stamp. */
  private carry = 0;

  constructor(layer: CanvasRenderingContext2D, x: number, y: number, size: number, color: RGB, seed: number) {
    this.layer = layer;
    this.stamps = brushStamps(size, color);
    this.half = this.stamps[0].width / 2;
    this.spacing = Math.max(0.4, size * 0.18);
    this.rng = mulberry32(seed);
    this.x = x;
    this.y = y;
    this.stamp(x, y);
    this.initialDirty = this.bounds.toRect();
  }

  private stamp(x: number, y: number): void {
    const s = this.stamps[Math.floor(this.rng() * this.stamps.length)];
    this.layer.drawImage(s, x - this.half, y - this.half);
    this.bounds.add(x, y, this.half + 1);
  }

  lineTo(x: number, y: number): Rect | null {
    const dx = x - this.x;
    const dy = y - this.y;
    const d = Math.hypot(dx, dy);
    if (!(d > 0)) return null;
    this.bounds.reset();
    let t = this.spacing - this.carry;
    let last = -1;
    while (t <= d) {
      this.stamp(this.x + (dx * t) / d, this.y + (dy * t) / d);
      last = t;
      t += this.spacing;
    }
    this.carry = last < 0 ? this.carry + d : d - last;
    this.x = x;
    this.y = y;
    return this.bounds.toRect();
  }

  hold(): Rect | null {
    return null;
  }
}

// =============================================================================================
// Calligraphy brushes (flat nib)

/** Convex hull (monotone chain), in the input format [x0, y0, x1, y1, …]. */
function convexHull(xy: number[]): number[] {
  const n = xy.length / 2;
  const idx = Array.from({ length: n }, (_, i) => i).toSorted(
    (a, b) => xy[2 * a] - xy[2 * b] || xy[2 * a + 1] - xy[2 * b + 1],
  );
  const cross = (o: number, a: number, b: number): number =>
    (xy[2 * a] - xy[2 * o]) * (xy[2 * b + 1] - xy[2 * o + 1]) -
    (xy[2 * a + 1] - xy[2 * o + 1]) * (xy[2 * b] - xy[2 * o]);
  const lower: number[] = [];
  for (const i of idx) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], i) <= 0) lower.pop();
    lower.push(i);
  }
  const upper: number[] = [];
  for (let k = idx.length - 1; k >= 0; k--) {
    const i = idx[k];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], i) <= 0) upper.pop();
    upper.push(i);
  }
  lower.pop();
  upper.pop();
  const out: number[] = [];
  for (const i of lower.concat(upper)) out.push(xy[2 * i], xy[2 * i + 1]);
  return out;
}

class NibStroke implements BrushStroke {
  readonly layerAlpha = 1;
  readonly initialDirty: Rect | null;
  private readonly layer: CanvasRenderingContext2D;
  private readonly css: string;
  /** Half nib length (along) and half thickness (across). */
  private readonly ax: number;
  private readonly ay: number;
  private readonly bx: number;
  private readonly by: number;
  private x: number;
  private y: number;

  /** slope = 1 → "/" nib, slope = -1 → "\" nib. */
  constructor(layer: CanvasRenderingContext2D, x: number, y: number, size: number, color: RGB, slope: 1 | -1) {
    this.layer = layer;
    this.css = rgbCss(color);
    const k = Math.SQRT1_2;
    const hl = size / 2;
    const ht = Math.max(0.5, size * 0.07);
    this.ax = hl * k;
    this.ay = -slope * hl * k;
    this.bx = slope * ht * k;
    this.by = ht * k;
    this.x = x;
    this.y = y;
    this.initialDirty = this.fill(this.corners(x, y));
  }

  private corners(x: number, y: number): number[] {
    const { ax, ay, bx, by } = this;
    return [x + ax + bx, y + ay + by, x + ax - bx, y + ay - by, x - ax - bx, y - ay - by, x - ax + bx, y - ay + by];
  }

  private fill(poly: number[]): Rect | null {
    const ctx = this.layer;
    const b = new Bounds();
    ctx.beginPath();
    for (let i = 0; i < poly.length; i += 2) {
      if (i === 0) ctx.moveTo(poly[i], poly[i + 1]);
      else ctx.lineTo(poly[i], poly[i + 1]);
      b.add(poly[i], poly[i + 1], 1);
    }
    ctx.closePath();
    ctx.fillStyle = this.css;
    ctx.fill();
    return b.toRect();
  }

  lineTo(x: number, y: number): Rect | null {
    if (x === this.x && y === this.y) return null;
    const hull = convexHull(this.corners(this.x, this.y).concat(this.corners(x, y)));
    this.x = x;
    this.y = y;
    return this.fill(hull);
  }

  hold(): Rect | null {
    return null;
  }
}

// =============================================================================================
// Airbrush

class AirbrushStroke implements BrushStroke {
  readonly layerAlpha = 1;
  readonly initialDirty: Rect | null;
  private readonly layer: CanvasRenderingContext2D;
  private readonly css: string;
  private readonly radius: number;
  private readonly perHold: number;
  private readonly perPx: number;
  private readonly rng: () => number;
  private readonly bounds = new Bounds();
  private x: number;
  private y: number;
  private carry = 0;

  constructor(layer: CanvasRenderingContext2D, x: number, y: number, size: number, color: RGB, seed: number) {
    this.layer = layer;
    this.css = rgbCss(color);
    this.radius = size / 2;
    const area = Math.PI * this.radius * this.radius;
    // ~33 calls per second: after 1 s the expected coverage is 1 - e^(-3.3) ≈ 96 %.
    this.perHold = Math.max(1, Math.ceil(area / 10));
    this.perPx = 0.3 * size;
    this.rng = mulberry32(seed);
    this.x = x;
    this.y = y;
    this.initialDirty = this.spray(this.perHold, x, y, x, y);
  }

  private spray(count: number, x0: number, y0: number, x1: number, y1: number): Rect | null {
    if (count <= 0) return null;
    const ctx = this.layer;
    const rng = this.rng;
    const r = this.radius;
    this.bounds.reset();
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const t = rng();
      const rho = r * Math.sqrt(rng());
      const th = rng() * TAU;
      const px = Math.floor(x0 + (x1 - x0) * t + Math.cos(th) * rho);
      const py = Math.floor(y0 + (y1 - y0) * t + Math.sin(th) * rho);
      ctx.rect(px, py, 1, 1);
      this.bounds.add(px, py);
      this.bounds.add(px + 1, py + 1);
    }
    ctx.fillStyle = this.css;
    ctx.fill();
    return this.bounds.toRect();
  }

  lineTo(x: number, y: number): Rect | null {
    const d = Math.hypot(x - this.x, y - this.y);
    if (!(d > 0)) return null;
    this.carry += d * this.perPx;
    const n = Math.floor(this.carry);
    this.carry -= n;
    const r = this.spray(n, this.x, this.y, x, y);
    this.x = x;
    this.y = y;
    return r;
  }

  hold(): Rect | null {
    return this.spray(this.perHold, this.x, this.y, this.x, this.y);
  }
}

// =============================================================================================
// Oil (bristles)

interface Bristle {
  /** Perpendicular offset from the stroke center (px). */
  off: number;
  /** Amplitude with which the bristle wiggles around its offset. */
  wobble: number;
  /** Distance after which the bristle starts running out of paint (Infinity = never). */
  dryAt: number;
  phase: number;
}

/** Bristles sharing tone and thickness: drawn together in a single stroke(). */
interface BristleGroup {
  css: string;
  w: number;
  bristles: Bristle[];
}

/** Length over which a bristle goes from loaded to almost dry. */
const DRY_RAMP = 500;
/** Bristle tones: <0 mixes with black, >0 with white (sheen of thick paint). */
const OIL_SHADES = [-0.26, -0.13, 0, 0.14, 0.28] as const;

function makeBristleGroups(size: number, color: RGB, seed: number, opts: PainterOptions): BristleGroup[] {
  const rng = mulberry32(seed ^ 0x0115eed);
  const k = clamp(Math.round(size / 1.2), 5, 32);
  const pitch = size / k;
  const span = Math.max(0, size - pitch * 1.6);
  const reach = 350 + size * 12;
  const widths = [Math.max(0.8, pitch * 1.1), Math.max(1, pitch * 1.9)];
  const groups: (BristleGroup | undefined)[] = [];
  for (let i = 0; i < k; i++) {
    const shade = Math.floor(rng() * OIL_SHADES.length);
    const wide = rng() < 0.5 ? 1 : 0;
    const key = shade * 2 + wide;
    let g = groups[key];
    if (!g) {
      const s = OIL_SHADES[shade];
      g = { css: rgbCss(s < 0 ? mixRgb(color, BLACK, -s) : mixRgb(color, WHITE, s)), w: widths[wide], bristles: [] };
      groups[key] = g;
    }
    g.bristles.push({
      off: (-0.5 + (i + 0.5) / k) * span + (rng() - 0.5) * pitch,
      wobble: opts.wobble ? pitch * (0.4 + rng() * 0.8) : 0,
      dryAt: opts.dry ? reach * (0.55 + rng() * 0.9) : Infinity,
      phase: rng() * 1000,
    });
  }
  const out = groups.filter((g): g is BristleGroup => g !== undefined);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Appends to the current path the segments offset by `off` px (wiggling `wobble` px), skipping
 * small pieces where the bristle has dried (from length dryAt on). It is deterministic: it depends
 * only on the distance traveled, so repainting a region gives exactly the same result.
 */
function appendRuns(
  ctx: CanvasRenderingContext2D,
  runs: readonly Run[],
  off: number,
  dryAt = Infinity,
  phase = 0,
  wobble = 0,
): void {
  const offAt = (s: number): number => (wobble > 0 ? off + wobble * (2 * valueNoise1D(phase + s / 45, 91) - 1) : off);
  for (const { line, i0, i1 } of runs) {
    const { xs, ys, nx, ny, ds } = line;
    if (i1 === i0) {
      if (ds[i0] > dryAt) continue;
      const o = offAt(ds[i0]);
      const x = xs[i0] + nx[i0] * o;
      const y = ys[i0] + ny[i0] * o;
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.01, y);
      continue;
    }
    let pen = false;
    let oa = offAt(ds[i0]);
    for (let i = i0; i < i1; i++) {
      const ob = offAt(ds[i + 1]);
      const ax = xs[i] + nx[i] * oa;
      const ay = ys[i] + ny[i] * oa;
      const bx = xs[i + 1] + nx[i + 1] * ob;
      const by = ys[i + 1] + ny[i + 1] * ob;
      oa = ob;
      if (ds[i + 1] <= dryAt) {
        if (!pen) ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
        pen = true;
        continue;
      }
      const len = ds[i + 1] - ds[i];
      const pieces = Math.max(1, Math.ceil(len / 3));
      for (let j = 0; j < pieces; j++) {
        const s = ds[i] + (len * (j + 0.5)) / pieces;
        const dryness = clamp((s - dryAt) / DRY_RAMP, 0, 0.85);
        if (dryness > 0 && valueNoise1D(phase + s / 9, 77) < dryness) {
          pen = false;
          continue;
        }
        const t1 = (j + 1) / pieces;
        if (!pen) {
          const t0 = j / pieces;
          ctx.moveTo(ax + (bx - ax) * t0, ay + (by - ay) * t0);
        }
        ctx.lineTo(ax + (bx - ax) * t1, ay + (by - ay) * t1);
        pen = true;
      }
    }
  }
}

// =============================================================================================
// Region-repainted brushes: oil, crayon, marker, natural pencil and watercolor

type RegionKind = 'oil' | 'crayon' | 'marker' | 'naturalPencil' | 'watercolor';

interface RegionPainter {
  /** Maximum distance the paint reaches from the polyline. */
  readonly pad: number;
  readonly layerAlpha: number;
  /** Paints the runs within r. The area is already clipped and cleared; may change ctx state. */
  paint(ctx: CanvasRenderingContext2D, runs: readonly Run[], r: Rect): void;
}

interface PainterOptions {
  /** Oil: the paint runs out on long strokes. */
  dry: boolean;
  /** Oil: round loading dab at the start of each polyline. */
  blob: boolean;
  /** Oil and watercolor: streaks wiggle along the stroke (not periodic: unsuitable for tiles). */
  wobble: boolean;
  /** Watercolor: apply the paper blotches (512 px period, larger than the tiles'). */
  blotch: boolean;
}

const STROKE_OPTIONS: PainterOptions = { dry: true, blob: true, wobble: true, blotch: true };
const SHAPE_OPTIONS: PainterOptions = { dry: false, blob: false, wobble: true, blotch: true };
const TILE_OPTIONS: PainterOptions = { dry: false, blob: false, wobble: false, blotch: false };

interface Streak {
  off: number;
  wobble: number;
  phase: number;
}

/** Watercolor streaks sharing tone and thickness (drawn together in a single stroke()). */
interface StreakGroup {
  /** Dark: darker tone, opaque, over the body. Light: remove pigment (destination-out). */
  dark: boolean;
  css: string;
  alpha: number;
  w: number;
  streaks: Streak[];
}

/** Several concentric passes of the current path: [width, alpha] (no build-up along it). */
function bands(c: CanvasRenderingContext2D, list: readonly (readonly [number, number])[]): void {
  for (const [w, a] of list) {
    if (!(w > 0) || !(a > 0)) continue;
    c.globalAlpha = a;
    c.lineWidth = w;
    c.stroke();
  }
}

function regionPainter(
  kind: RegionKind,
  size: number,
  color: RGB,
  seed: number,
  ctx: CanvasRenderingContext2D,
  opts: PainterOptions = STROKE_OPTIONS,
): RegionPainter {
  const css = rgbCss(color);
  switch (kind) {
    case 'oil': {
      const groups = makeBristleGroups(size, color, seed, opts);
      // Paint body under the bristles; it dries before most of them.
      let minDry = Infinity;
      for (const g of groups) for (const b of g.bristles) minDry = Math.min(minDry, b.dryAt);
      const bodyDry = minDry * 0.85;
      return {
        pad: size / 2 + 2,
        layerAlpha: 1,
        paint(c, runs) {
          c.lineJoin = 'round';
          if (opts.blob) {
            c.fillStyle = css;
            c.beginPath();
            for (const { line, i0 } of runs) {
              if (i0 !== 0) continue;
              c.moveTo(line.xs[0] + size * 0.37, line.ys[0]);
              c.arc(line.xs[0], line.ys[0], size * 0.37, 0, TAU);
            }
            c.fill();
          }
          c.beginPath();
          appendRuns(c, runs, 0, bodyDry, seed % 997);
          c.strokeStyle = css;
          c.lineCap = 'butt';
          c.lineWidth = size * 0.8;
          c.stroke();
          c.lineCap = 'round';
          for (const g of groups) {
            c.beginPath();
            for (const b of g.bristles) appendRuns(c, runs, b.off, b.dryAt, b.phase, b.wobble);
            c.strokeStyle = g.css;
            c.lineWidth = g.w;
            c.stroke();
          }
        },
      };
    }
    case 'crayon': {
      const grain = grainPattern(ctx, 'crayon', color);
      return {
        pad: size / 2 + 2,
        layerAlpha: 1,
        paint(c, runs, r) {
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.strokeStyle = css;
          traceRuns(c, runs);
          bands(c, [
            [size + 2, 0.3],
            [size, 0.65],
            [size * 0.72, 1],
          ]);
          // Color × paper grain (anchored to the document) × coverage.
          c.globalCompositeOperation = 'source-in';
          c.globalAlpha = 1;
          c.fillStyle = grain;
          c.fillRect(r.x, r.y, r.w, r.h);
        },
      };
    }
    case 'naturalPencil': {
      const grain = grainPattern(ctx, 'pencil', color);
      return {
        pad: size / 2 + 1.5,
        layerAlpha: 1,
        paint(c, runs, r) {
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.strokeStyle = css;
          traceRuns(c, runs);
          // Core more loaded with graphite, and edges that break up into the paper grain.
          bands(c, [
            [size + 1, 0.3],
            [size * 0.8, 0.55],
            [size * 0.45, 1],
          ]);
          c.globalCompositeOperation = 'source-in';
          c.globalAlpha = 1;
          c.fillStyle = grain;
          c.fillRect(r.x, r.y, r.w, r.h);
        },
      };
    }
    case 'marker':
      return {
        pad: size / 2 + 1.5,
        layerAlpha: LAYER_ALPHA.marker,
        paint(c, runs) {
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.strokeStyle = css;
          traceRuns(c, runs);
          // Soft edge: concentric bands of the same path; uniform color inside.
          bands(c, [
            [size + 1.5, 0.3],
            [size, 0.6],
            [Math.max(size * 0.5, size - 1.5), 1],
          ]);
        },
      };
    case 'watercolor': {
      const blotch = grainPattern(ctx, 'blotch', BLACK);
      const rng = mulberry32(seed ^ 0x3a7e);
      // Light streaks (water dragging pigment) and dark ones (accumulated pigment), thin and wide.
      const thin = 0.8 + size * 0.015;
      const wide = 1 + size * 0.05;
      const groups: StreakGroup[] = [
        { dark: false, css, alpha: 0.2, w: thin, streaks: [] },
        { dark: false, css, alpha: 0.1, w: wide, streaks: [] },
        { dark: true, css: rgbCss(mixRgb(color, BLACK, 0.22)), alpha: 1, w: thin, streaks: [] },
        { dark: true, css: rgbCss(mixRgb(color, BLACK, 0.1)), alpha: 1, w: wide, streaks: [] },
      ];
      const k = clamp(Math.round(size / 2.2), 4, 18);
      for (let i = 0; i < k; i++) {
        const g = groups[i % groups.length];
        const wobble = opts.wobble ? size * (0.02 + rng() * 0.04) : 0;
        // Always inside the opaque body (they must not show at the blurred edge).
        const maxOff = Math.max(0, (size - 1) / 2 - g.w / 2 - wobble);
        g.streaks.push({ off: (rng() * 2 - 1) * maxOff * 0.95, wobble, phase: rng() * 1000 });
      }
      return {
        pad: size / 2 + 2.5,
        layerAlpha: LAYER_ALPHA.watercolor,
        paint(c, runs, r) {
          c.lineCap = 'round';
          c.lineJoin = 'round';
          c.strokeStyle = css;
          traceRuns(c, runs);
          // Edge blurred outward.
          bands(c, [
            [size + 3, 0.2],
            [size + 1, 0.45],
            [Math.max(1, size - 1), 1],
          ]);
          // Fine streaks along the stroke: the dark ones, opaque over the opaque body (they only change
          // the tone; this is the fast rasterization path)…
          const streaks = (dark: boolean): void => {
            for (const g of groups) {
              if (g.dark !== dark || g.streaks.length === 0) continue;
              c.beginPath();
              for (const s of g.streaks) appendRuns(c, runs, s.off, Infinity, s.phase, s.wobble);
              c.strokeStyle = g.css;
              c.globalAlpha = g.alpha;
              c.lineWidth = g.w;
              c.stroke();
            }
          };
          c.globalAlpha = 1;
          streaks(true);
          // …the interior, slightly lighter than the edge, as a gradient (pigment builds up at the boundary)…
          traceRuns(c, runs);
          c.globalCompositeOperation = 'destination-out';
          bands(c, [
            [size * 0.84, 0.07],
            [size * 0.64, 0.07],
            [size * 0.44, 0.07],
          ]);
          // …and the light ones remove pigment, so they reveal whatever is underneath.
          streaks(false);
          // Paper blotches (anchored to the document).
          if (opts.blotch) {
            c.globalCompositeOperation = 'destination-out';
            c.globalAlpha = 1;
            c.fillStyle = blotch;
            c.fillRect(r.x, r.y, r.w, r.h);
          }
        },
      };
    }
  }
}

class RegionStroke implements BrushStroke {
  readonly layerAlpha: number;
  readonly initialDirty: Rect | null;
  private readonly layer: CanvasRenderingContext2D;
  private readonly painter: RegionPainter;
  private readonly builder: PolylineBuilder;

  constructor(layer: CanvasRenderingContext2D, x: number, y: number, size: number, painter: RegionPainter) {
    this.layer = layer;
    this.painter = painter;
    // Wide brushes don't need points so close together (fewer segments to repaint).
    this.builder = new PolylineBuilder(Math.max(0.75, size * 0.08));
    this.layerAlpha = painter.layerAlpha;
    this.builder.start(x, y);
    const p = painter.pad + 1;
    const r = intRect(x - p, y - p, x + p, y + p);
    this.render(r);
    this.initialDirty = r;
  }

  private render(r: Rect): void {
    const runs = runsInRect(this.builder.lines, r, this.painter.pad + 1);
    const ctx = this.layer;
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.w, r.h);
    ctx.clip();
    ctx.clearRect(r.x, r.y, r.w, r.h);
    if (runs.length > 0) this.painter.paint(ctx, runs, r);
    ctx.restore();
  }

  lineTo(x: number, y: number): Rect | null {
    const prev = this.builder.last;
    if (!prev || !this.builder.add(x, y)) return null;
    const p = this.painter.pad + 1;
    const r = intRect(
      Math.min(prev.x, x) - p,
      Math.min(prev.y, y) - p,
      Math.max(prev.x, x) + p,
      Math.max(prev.y, y) + p,
    );
    this.render(r);
    return r;
  }

  hold(): Rect | null {
    return null;
  }
}

// =============================================================================================
// Stroke API

/** Starts a brush stroke and paints the first dab at (x, y). */
export function beginBrushStroke(
  kind: BrushKind,
  layer: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: RGB,
  seed?: number,
): BrushStroke {
  const s = Number.isFinite(size) && size > 0 ? size : BRUSH_DEFAULT_SIZE[kind];
  const sd = seed === undefined ? defaultSeed(x, y) : seed >>> 0;
  switch (kind) {
    case 'brush':
      return new StampBrushStroke(layer, x, y, s, color, sd);
    case 'calligraphy1':
      return new NibStroke(layer, x, y, s, color, 1);
    case 'calligraphy2':
      return new NibStroke(layer, x, y, s, color, -1);
    case 'airbrush':
      return new AirbrushStroke(layer, x, y, s, color, sd);
    case 'oil':
    case 'crayon':
    case 'marker':
    case 'naturalPencil':
    case 'watercolor':
      return new RegionStroke(layer, x, y, s, regionPainter(kind, s, color, sd, layer));
  }
}

// =============================================================================================
// Shape outline and fill

type TexturedStyle = Exclude<ShapeStyle, 'none' | 'solid'>;

const SHAPE_SEED = 0x5a9e;

function styleAlpha(style: TexturedStyle): number {
  return style === 'marker' ? LAYER_ALPHA.marker : style === 'watercolor' ? LAYER_ALPHA.watercolor : 1;
}

let scratchCanvas: HTMLCanvasElement | null = null;
const SCRATCH_KEEP_PIXELS = 4_000_000;

/** Reusable auxiliary canvas (transparent in [0, w) × [0, h)). */
function scratch(w: number, h: number): CanvasRenderingContext2D {
  if (!scratchCanvas || scratchCanvas.width < w || scratchCanvas.height < h) {
    scratchCanvas = createCanvas(Math.max(w, scratchCanvas?.width ?? 0), Math.max(h, scratchCanvas?.height ?? 0));
  }
  const ctx = context2d(scratchCanvas);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return ctx;
}

/** Draws with `draw` (in document coordinates) on the auxiliary canvas and composites it onto target. */
function viaScratch(
  target: CanvasRenderingContext2D,
  r: Rect,
  alpha: number,
  draw: (ctx: CanvasRenderingContext2D) => void,
): void {
  const ctx = scratch(r.w, r.h);
  ctx.save();
  ctx.translate(-r.x, -r.y);
  draw(ctx);
  ctx.restore();
  target.save();
  target.globalAlpha *= alpha;
  target.drawImage(ctx.canvas, 0, 0, r.w, r.h, r.x, r.y, r.w, r.h);
  target.restore();
  if (scratchCanvas && scratchCanvas.width * scratchCanvas.height > SCRATCH_KEEP_PIXELS) scratchCanvas = null;
}

function contourBounds(contours: readonly Contour[], pad: number): Rect | null {
  const b = new Bounds();
  for (const c of contours) for (const p of c.points) b.add(p.x, p.y, pad);
  return b.toRect();
}

/** Outline polylines (closed ones return to the first point). */
function contourLines(contours: readonly Contour[]): Polyline[] {
  const b = new PolylineBuilder(0.2, 0.35);
  for (const c of contours) {
    const pts = c.points;
    if (pts.length === 0) continue;
    b.start(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) b.add(pts[i].x, pts[i].y);
    if (c.closed && pts.length > 2) b.add(pts[0].x, pts[0].y);
  }
  return b.lines;
}

function allRuns(lines: readonly Polyline[]): Run[] {
  return lines.map((line) => ({ line, i0: 0, i1: line.xs.length - 1 }));
}

/**
 * Shape outline with the given style, drawn directly into ctx (final result: translucent
 * styles are composited internally). size = outline thickness in px.
 */
export function strokeContours(
  style: Exclude<ShapeStyle, 'none'>,
  ctx: CanvasRenderingContext2D,
  contours: Contour[],
  size: number,
  color: RGB,
): void {
  const valid = contours.filter((c) => c.points.length > 0);
  if (valid.length === 0 || !(size > 0)) return;
  if (style === 'solid') {
    ctx.save();
    ctx.strokeStyle = rgbCss(color);
    ctx.lineWidth = size;
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;
    const closedOnes = valid.filter((c) => c.closed);
    const openOnes = valid.filter((c) => !c.closed);
    if (closedOnes.length > 0) {
      ctx.lineCap = 'butt';
      ctx.stroke(contoursToPath2D(closedOnes));
    }
    if (openOnes.length > 0) {
      ctx.lineCap = 'round';
      ctx.stroke(contoursToPath2D(openOnes));
    }
    ctx.restore();
    return;
  }
  const r = contourBounds(valid, size / 2 + 4);
  if (!r) return;
  const lines = contourLines(valid);
  viaScratch(ctx, r, styleAlpha(style), (sc) => {
    regionPainter(style, size, color, SHAPE_SEED, sc, SHAPE_OPTIONS).paint(sc, allRuns(lines), r);
  });
}

/** Side of the fill tiles (equal to the period of the paper textures). */
const FILL_TILE = 256;
const fillTileCache = new LimitedCache<HTMLCanvasElement>(12);

type TiledFill = 'oil' | 'watercolor' | 'naturalPencil';

/**
 * Periodic FILL_TILE px tile painted with the brush itself (rows of oil or watercolor, diagonal
 * pencil hatching). It is painted on a 3×3 canvas with periodic strokes and the center is cropped, so
 * it repeats seamlessly; filling a shape is then a single operation, whatever its size.
 */
function fillTile(style: TiledFill, color: RGB): HTMLCanvasElement {
  return fillTileCache.get(`${style}|${rgbKey(color)}`, () => {
    const T = FILL_TILE;
    // A margin around the tile larger than the reach of the strokes is enough.
    const M = 64;
    const big = createCanvas(T + 2 * M, T + 2 * M);
    const c = context2d(big);
    c.translate(M, M);
    const area: Rect = { x: -M, y: -M, w: T + 2 * M, h: T + 2 * M };
    if (style === 'naturalPencil') {
      // "/" hatching with 57 lines per period (≈ 4.5 px spacing).
      const n = 57;
      const b = new PolylineBuilder(0.5, 0.3);
      const y0 = -2 * M;
      const y1 = T + 2 * M;
      for (let k = Math.floor((-4 * M * n) / T); k <= Math.ceil(((2 * T + 4 * M) * n) / T); k++) {
        const cc = (k * T) / n;
        b.start(cc - y0, y0);
        b.add(cc - y1, y1);
      }
      regionPainter('naturalPencil', 3.5, color, SHAPE_SEED, c, TILE_OPTIONS).paint(c, allRuns(b.lines), area);
    } else {
      // Horizontal rows with a slight periodic wave; 3 alternating sets of bristles/streaks.
      const rows = style === 'oil' ? 18 : 24;
      const size = style === 'oil' ? 24 : 26;
      const spacing = T / rows;
      const sets = 3;
      const lines: Polyline[][] = [[], [], []];
      const extra = Math.ceil(M / spacing) + 1;
      for (let j = -extra; j <= rows + extra; j++) {
        const jm = ((j % rows) + rows) % rows;
        const b = new PolylineBuilder(0.5, 0.3);
        // Samples at multiples of 16 px (periodic), starting well outside so that the smoothed
        // normals are already stable when they reach the tile.
        for (let x = -M - 128; x <= T + M + 48; x += 16) {
          const y = j * spacing + Math.sin((x / T) * 4 * Math.PI + jm * 1.3) * size * 0.06;
          if (b.lines.length === 0) b.start(x, y);
          else b.add(x, y);
        }
        lines[jm % sets].push(...b.lines);
      }
      for (let set = 0; set < sets; set++) {
        c.save();
        regionPainter(style, size, color, SHAPE_SEED + set, c, TILE_OPTIONS).paint(c, allRuns(lines[set]), area);
        c.restore();
      }
    }
    const tile = createCanvas(T, T);
    context2d(tile).drawImage(big, M, M, T, T, 0, 0, T, T);
    return tile;
  });
}

/**
 * Shape fill with the given style ('solid' = plain fill; textured styles fill the
 * interior with that brush's texture, anchored to the document).
 */
export function fillContours(
  style: Exclude<ShapeStyle, 'none'>,
  ctx: CanvasRenderingContext2D,
  contours: Contour[],
  color: RGB,
): void {
  const valid = contours.filter((c) => c.points.length > 2);
  if (valid.length === 0) return;
  const path = contoursToPath2D(valid);
  if (style === 'solid') {
    ctx.save();
    ctx.fillStyle = rgbCss(color);
    ctx.fill(path);
    ctx.restore();
    return;
  }
  const r = contourBounds(valid, 0);
  if (!r) return;
  viaScratch(ctx, r, styleAlpha(style), (sc) => {
    sc.clip(path);
    switch (style) {
      case 'marker':
        sc.fillStyle = rgbCss(color);
        break;
      case 'crayon':
        sc.fillStyle = grainPattern(sc, 'crayon', color);
        break;
      default:
        sc.fillStyle = sc.createPattern(fillTile(style, color), 'repeat') ?? rgbCss(color);
    }
    sc.fillRect(r.x, r.y, r.w, r.h);
    if (style === 'watercolor') {
      // Paper blotches (separate from the tile: they have a longer period).
      sc.globalCompositeOperation = 'destination-out';
      sc.fillStyle = grainPattern(sc, 'blotch', BLACK);
      sc.fillRect(r.x, r.y, r.w, r.h);
      sc.globalCompositeOperation = 'source-over';
      // Slightly darker edge, like pigment building up at the boundary of the blotch.
      sc.globalAlpha = 0.35;
      sc.strokeStyle = rgbCss(color);
      sc.lineWidth = 4;
      sc.stroke(path);
    }
  });
}
