/**
 * Procedural (original) textures for the artistic brushes.
 * They are periodic tiles (256 px; 512 px for the watercolor blotches) used as a CanvasPattern anchored
 * to the document origin, so the "paper" grain is the same across all strokes.
 */
import type { RGB } from '../types';
import { LimitedCache, clamp, context2d, createCanvas, rgbKey, smoothstep } from './util';
import { hash3, tileValueNoise } from './random';

export const TILE = 256;
/** Watercolor blotches are large: with a longer period the repetition is not noticeable. */
const BLOTCH_TILE = 512;

function tileSize(kind: GrainKind): number {
  return kind === 'blotch' ? BLOTCH_TILE : TILE;
}

export type GrainKind = 'crayon' | 'pencil' | 'blotch';

const alphaMaps = new Map<GrainKind, Uint8ClampedArray>();

function crayonAlpha(x: number, y: number): number {
  // Wax on the tooth of the paper: small white specks (1–2 px), slightly elongated horizontally,
  // and slightly lighter areas where the paper is more recessed.
  const mid = tileValueNoise(x, y * 2, 128, TILE, 12);
  const fine = hash3(x, y, 13);
  const tooth = tileValueNoise(x, y, 32, TILE, 11);
  const n = 0.5 * mid + 0.25 * fine + 0.25 * tooth;
  const patch = tileValueNoise(x, y, 8, TILE, 14);
  return smoothstep(0.29, 0.41, n) * (0.8 + 0.2 * patch);
}

function pencilAlpha(x: number, y: number): number {
  // Graphite: very fine grain with some diagonal paper fiber; never fully opaque.
  const fine = hash3(x, y, 21);
  const mid = tileValueNoise(x, y, 128, TILE, 22);
  const fibre = tileValueNoise(x + y, y - x, 64, TILE, 23);
  const n = 0.5 * fine + 0.3 * mid + 0.2 * fibre;
  return 0.3 + 0.62 * smoothstep(0.24, 0.62, n);
}

function blotchAlpha(x: number, y: number): number {
  // Amount of pigment "removed" (destination-out): large soft blotches + granulation.
  // A mix of axis-aligned layers and layers rotated 45° ((x+y, y−x) is still periodic)
  // so the blotches do not look rectangular.
  const u = x + y;
  const v = y - x;
  const b =
    0.35 * tileValueNoise(x, y, 8, BLOTCH_TILE, 31) +
    0.3 * tileValueNoise(u, v, 8, BLOTCH_TILE, 35) +
    0.2 * tileValueNoise(x, y, 16, BLOTCH_TILE, 32) +
    0.15 * tileValueNoise(u, v, 32, BLOTCH_TILE, 33);
  return clamp((b - 0.45) * 2.8, 0, 0.55) + 0.07 * hash3(x, y, 34);
}

function alphaMap(kind: GrainKind): Uint8ClampedArray {
  let map = alphaMaps.get(kind);
  if (map) return map;
  const fn = kind === 'crayon' ? crayonAlpha : kind === 'pencil' ? pencilAlpha : blotchAlpha;
  const n = tileSize(kind);
  map = new Uint8ClampedArray(n * n);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) map[y * n + x] = Math.round(fn(x, y) * 255);
  }
  alphaMaps.set(kind, map);
  return map;
}

const tiles = new LimitedCache<HTMLCanvasElement>(24);

/** Tile of the given color whose alpha is the given texture. */
export function grainTile(kind: GrainKind, color: RGB): HTMLCanvasElement {
  return tiles.get(`${kind}|${rgbKey(color)}`, () => {
    const n = tileSize(kind);
    const canvas = createCanvas(n, n);
    const ctx = context2d(canvas);
    const img = ctx.createImageData(n, n);
    const a = alphaMap(kind);
    const d = img.data;
    const r = clamp(Math.round(color[0]), 0, 255);
    const g = clamp(Math.round(color[1]), 0, 255);
    const b = clamp(Math.round(color[2]), 0, 255);
    for (let i = 0, j = 0; i < a.length; i++, j += 4) {
      d[j] = r;
      d[j + 1] = g;
      d[j + 2] = b;
      d[j + 3] = a[i];
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  });
}

/** Repeating pattern (anchored to the origin of the `ctx` coordinate system). */
export function grainPattern(ctx: CanvasRenderingContext2D, kind: GrainKind, color: RGB): CanvasPattern | string {
  return ctx.createPattern(grainTile(kind, color), 'repeat') ?? 'transparent';
}
