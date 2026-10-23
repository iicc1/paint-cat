/** Deterministic randomness and procedural noise for the brush textures. */

/** mulberry32 pseudorandom generator: returns numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Integer hash of three components → [0, 1). */
export function hash3(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function fade(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Periodic 2D value noise: `cells` cells along `period` pixels (repeats seamlessly). */
export function tileValueNoise(x: number, y: number, cells: number, period: number, seed: number): number {
  const fx = (x / period) * cells;
  const fy = (y / period) * cells;
  const ix = Math.floor(fx);
  const iy = Math.floor(fy);
  const sx = fade(fx - ix);
  const sy = fade(fy - iy);
  const x0 = ((ix % cells) + cells) % cells;
  const y0 = ((iy % cells) + cells) % cells;
  const x1 = (x0 + 1) % cells;
  const y1 = (y0 + 1) % cells;
  const a = hash3(x0, y0, seed);
  const b = hash3(x1, y0, seed);
  const c = hash3(x0, y1, seed);
  const d = hash3(x1, y1, seed);
  const top = a + (b - a) * sx;
  const bottom = c + (d - c) * sx;
  return top + (bottom - top) * sy;
}

/** Smooth 1D value noise in [0, 1). */
export function valueNoise1D(t: number, seed: number): number {
  const i = Math.floor(t);
  const f = fade(t - i);
  const a = hash3(i, 0, seed);
  const b = hash3(i + 1, 0, seed);
  return a + (b - a) * f;
}
