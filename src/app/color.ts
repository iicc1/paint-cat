import type { RGB } from '../paint/types';

export const BLACK: RGB = [0, 0, 0];
export const WHITE: RGB = [255, 255, 255];

/** Default palette of Windows 10 Paint (row 1 and row 2); their tooltip names are in `t.palette`. */
export const DEFAULT_PALETTE: readonly RGB[] = [
  [0, 0, 0],
  [127, 127, 127],
  [136, 0, 21],
  [237, 28, 36],
  [255, 127, 39],
  [255, 242, 0],
  [34, 177, 76],
  [0, 162, 232],
  [63, 72, 204],
  [163, 73, 164],
  [255, 255, 255],
  [195, 195, 195],
  [185, 122, 87],
  [255, 174, 201],
  [255, 201, 14],
  [239, 228, 176],
  [181, 230, 29],
  [153, 217, 234],
  [112, 146, 190],
  [200, 191, 231],
];

/** The 48 basic colors of the Edit Colors dialog (8 columns × 6 rows). */
export const BASIC_COLORS: readonly string[] = [
  '#FF8080', '#FFFF80', '#80FF80', '#00FF80', '#80FFFF', '#0080FF', '#FF80C0', '#FF80FF',
  '#FF0000', '#FFFF00', '#80FF00', '#00FF40', '#00FFFF', '#0080C0', '#8080C0', '#FF00FF',
  '#804040', '#FF8040', '#00FF00', '#008080', '#004080', '#8080FF', '#800040', '#FF0080',
  '#800000', '#FF8000', '#008000', '#008040', '#0000FF', '#0000A0', '#800080', '#8000FF',
  '#400000', '#804000', '#004000', '#004040', '#000080', '#000040', '#400040', '#400080',
  '#000000', '#808000', '#808040', '#808080', '#408080', '#C0C0C0', '#400040', '#FFFFFF',
]; // prettier-ignore

export function rgbToCss([r, g, b]: RGB): string {
  return `rgb(${r} ${g} ${b})`;
}

export function rgbToHex([r, g, b]: RGB): string {
  return (
    '#' +
    [r, g, b]
      .map((v) => v.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function hexToRgb(hex: string): RGB {
  const n = Number.parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function sameRgb(a: RGB, b: RGB): boolean {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2];
}

/** Packs opaque RGB into the Uint32Array-over-ImageData format (little-endian: ABGR). */
export function packRgb([r, g, b]: RGB): number {
  return ((255 << 24) | (b << 16) | (g << 8) | r) >>> 0;
}

/**
 * RGB → Hue/Sat/Lum conversion on the 0–240 scale of the Windows color picker.
 * (Hue 0–239, Saturation 0–240, Luminosity 0–240.)
 */
export function rgbToHsl240([r, g, b]: RGB): [number, number, number] {
  // Same integer arithmetic as Windows' ColorRGBToHLS (HLSMAX = 240).
  const div = (a: number, d: number): number => Math.trunc(a / d);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = div((max + min) * 240 + 255, 510);
  if (max === min) return [160, 0, l];
  const d = max - min;
  const s =
    l <= 120 ? div(d * 240 + div(max + min, 2), max + min) : div(d * 240 + div(510 - max - min, 2), 510 - max - min);
  const rd = div((max - r) * 40 + div(d, 2), d);
  const gd = div((max - g) * 40 + div(d, 2), d);
  const bd = div((max - b) * 40 + div(d, 2), d);
  let h = r === max ? bd - gd : g === max ? 80 + rd - bd : 160 + gd - rd;
  if (h < 0) h += 240;
  if (h >= 240) h -= 240;
  return [h, s, l];
}

export function hsl240ToRgb(h: number, s: number, l: number): RGB {
  const hh = (((h % 240) + 240) % 240) / 240;
  const ss = Math.min(240, Math.max(0, s)) / 240;
  const ll = Math.min(240, Math.max(0, l)) / 240;
  if (ss === 0) {
    const v = Math.round(ll * 255);
    return [v, v, v];
  }
  const q = ll < 0.5 ? ll * (1 + ss) : ll + ss - ll * ss;
  const p = 2 * ll - q;
  const hue = (t: number): number => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return [Math.round(hue(hh + 1 / 3) * 255), Math.round(hue(hh) * 255), Math.round(hue(hh - 1 / 3) * 255)];
}
