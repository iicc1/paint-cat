import { describe, expect, it } from 'vitest';
import { formatFromName } from '../io/files';
import { pageLayout } from '../io/print';
import { pushCustomColor } from '../ui/dialogs';
import { hexToRgb, hsl240ToRgb, packRgb, rgbToHex, rgbToHsl240 } from './color';
import { bresenham, clip, normRect, union } from './geometry';
import { initialState } from './state';
import { nextZoom, ZOOM_LEVELS } from './viewport';

describe('color', () => {
  it('converts to Hue/Sat/Lum like the Windows color picker', () => {
    // Values read from the original Edit Colors dialog for the Indigo color.
    expect(rgbToHsl240([63, 72, 204])).toEqual([157, 139, 126]);
    expect(rgbToHsl240([0, 0, 0])).toEqual([160, 0, 0]);
    expect(rgbToHsl240([255, 255, 255])).toEqual([160, 0, 240]);
    expect(rgbToHsl240([255, 0, 0])).toEqual([0, 240, 120]);
  });

  it('round-trips HSL (0–240) ↔ RGB with little loss', () => {
    for (const c of [
      [255, 0, 0],
      [0, 128, 255],
      [34, 177, 76],
      [200, 191, 231],
    ] as const) {
      const back = hsl240ToRgb(...rgbToHsl240(c));
      back.forEach((v, i) => expect(Math.abs(v - c[i])).toBeLessThanOrEqual(3));
    }
  });

  it('hex and ABGR packing', () => {
    expect(rgbToHex([237, 28, 36])).toBe('#ED1C24');
    expect(hexToRgb('#3F48CC')).toEqual([63, 72, 204]);
    expect(packRgb([1, 2, 3])).toBe(0xff030201);
  });
});

describe('zoom', () => {
  it('follows the Paint zoom steps', () => {
    const ins: number[] = [1];
    for (let i = 0; i < 9; i++) ins.push(nextZoom(ins[ins.length - 1], 1));
    expect(ins).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
    const outs: number[] = [1];
    for (let i = 0; i < 4; i++) outs.push(nextZoom(outs[outs.length - 1], -1));
    expect(outs).toEqual([1, 0.5, 0.25, 0.125, 0.125]);
    expect(ZOOM_LEVELS[0]).toBe(0.125);
  });
});

describe('geometry', () => {
  it('rectangles', () => {
    expect(normRect({ x: 10, y: 5 }, { x: 2, y: 9 })).toEqual({ x: 2, y: 5, w: 8, h: 4 });
    expect(union({ x: 0, y: 0, w: 2, h: 2 }, { x: 5, y: 5, w: 1, h: 1 })).toEqual({ x: 0, y: 0, w: 6, h: 6 });
    expect(clip({ x: -5, y: -5, w: 10, h: 10 }, 3, 3)).toEqual({ x: 0, y: 0, w: 3, h: 3 });
    expect(clip({ x: 5, y: 5, w: 2, h: 2 }, 3, 3)).toBeNull();
  });

  it('Bresenham includes the endpoints and is continuous', () => {
    const pts: [number, number][] = [];
    bresenham(0, 0, 5, 2, (x, y) => pts.push([x, y]));
    expect(pts[0]).toEqual([0, 0]);
    expect(pts[pts.length - 1]).toEqual([5, 2]);
    expect(pts).toHaveLength(6);
  });
});

describe('printing', () => {
  it('"Fit to 1 by 1" fits the image in the printable area', () => {
    const s = initialState().pageSetup;
    const l = pageLayout(s, 1152, 648);
    expect(l.pageW).toBe(297); // A4 landscape
    expect(l.pageH).toBe(210);
    expect(l.cols).toBe(1);
    expect(l.rows).toBe(1);
    expect(l.imageW).toBeLessThanOrEqual(l.printableW + 1e-6);
    expect(l.imageH).toBeLessThanOrEqual(l.printableH + 1e-6);
  });

  it('"Adjust to 400 %" spreads over several pages', () => {
    const s = { ...initialState().pageSetup, scaleMode: 'adjust' as const, scalePercent: 400 };
    const l = pageLayout(s, 1152, 648);
    expect(l.cols * l.rows).toBeGreaterThan(1);
  });
});

describe('files', () => {
  it('infers the format from the extension', () => {
    expect(formatFromName('foto.JPEG')).toBe('jpg');
    expect(formatFromName('dibujo.png')).toBe('png');
    expect(formatFromName('viejo.bmp')).toBe('bmp24');
    expect(formatFromName('viejo.bmp', 'bmp8')).toBe('bmp8');
    expect(formatFromName('anim.gif')).toBe('gif');
    expect(formatFromName('scan.tiff')).toBe('tiff');
    expect(formatFromName('sin-extension')).toBe('png');
  });
});

describe('custom palette colors', () => {
  it('fills the first empty slot and does not duplicate', () => {
    const empty = Array.from({ length: 10 }, () => null);
    const a = pushCustomColor(empty, [1, 2, 3]);
    expect(a[0]).toEqual([1, 2, 3]);
    expect(pushCustomColor(a, [1, 2, 3])).toEqual(a);
    const b = pushCustomColor(a, [4, 5, 6]);
    expect(b[1]).toEqual([4, 5, 6]);
  });

  it('when the row is full, shifts and appends at the end', () => {
    const full = Array.from({ length: 10 }, (_, i) => [i, i, i] as const);
    const next = pushCustomColor(full, [99, 99, 99]);
    expect(next).toHaveLength(10);
    expect(next[0]).toEqual([1, 1, 1]);
    expect(next[9]).toEqual([99, 99, 99]);
  });
});
