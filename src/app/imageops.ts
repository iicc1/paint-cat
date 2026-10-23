import type { RGB } from '../paint/types';
import { packRgb, rgbToCss } from './color';
import { createCanvas, ctx2d } from './doc';

export type Rotation = 'right' | 'left' | '180' | 'flipV' | 'flipH';

export function rotateCanvas(src: HTMLCanvasElement, op: Rotation): HTMLCanvasElement {
  const { width: w, height: h } = src;
  const swap = op === 'right' || op === 'left';
  const out = createCanvas(swap ? h : w, swap ? w : h);
  const ctx = ctx2d(out);
  ctx.imageSmoothingEnabled = false;
  switch (op) {
    case 'right':
      ctx.translate(h, 0);
      ctx.rotate(Math.PI / 2);
      break;
    case 'left':
      ctx.translate(0, w);
      ctx.rotate(-Math.PI / 2);
      break;
    case '180':
      ctx.translate(w, h);
      ctx.rotate(Math.PI);
      break;
    case 'flipV':
      ctx.translate(0, h);
      ctx.scale(1, -1);
      break;
    case 'flipH':
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
      break;
  }
  ctx.drawImage(src, 0, 0);
  return out;
}

/** Scales the image to the new size (Resize). */
export function scaleCanvas(src: HTMLCanvasElement, w: number, h: number): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const ctx = ctx2d(out);
  ctx.imageSmoothingQuality = 'high';
  ctx.imageSmoothingEnabled = w < src.width || h < src.height || (w % src.width !== 0 && h % src.height !== 0);
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

/**
 * Skew in degrees (horizontal and vertical, -89…89). The canvas grows to contain the result and
 * the new background is filled with `background` (Color 2), as in Paint.
 */
export function skewCanvas(
  src: HTMLCanvasElement,
  degX: number,
  degY: number,
  background: RGB | null,
): HTMLCanvasElement {
  if (!degX && !degY) return src;
  const tx = Math.tan((degX * Math.PI) / 180);
  const ty = Math.tan((degY * Math.PI) / 180);
  const { width: w, height: h } = src;
  // Matriz [1 tx; ty 1]: x' = x + tx*y, y' = ty*x + y
  const xs = [0, w, tx * h, w + tx * h];
  const ys = [0, ty * w, h, ty * w + h];
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const outW = Math.max(1, Math.round(Math.max(...xs) - minX));
  const outH = Math.max(1, Math.round(Math.max(...ys) - minY));
  const out = createCanvas(outW, outH);
  const ctx = ctx2d(out);
  if (background) {
    ctx.fillStyle = rgbToCss(background);
    ctx.fillRect(0, 0, outW, outH);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, ty, tx, 1, -minX, -minY);
  ctx.drawImage(src, 0, 0);
  return out;
}

export function invertCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = ctx2d(out, true);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    d[i] = 255 - d[i];
    d[i + 1] = 255 - d[i + 1];
    d[i + 2] = 255 - d[i + 2];
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

/** Converts to pure black and white (Properties › Colors › Black and white). */
export function monochromeCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const out = createCanvas(src.width, src.height);
  const ctx = ctx2d(out, true);
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2] >= 128 ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function cropCanvas(src: HTMLCanvasElement, x: number, y: number, w: number, h: number): HTMLCanvasElement {
  const out = createCanvas(w, h);
  ctx2d(out).drawImage(src, x, y, w, h, 0, 0, w, h);
  return out;
}

/** Flattens an image with transparency onto a background color (Paint documents are opaque). */
export function flattenOnto(src: CanvasImageSource, w: number, h: number, background: RGB): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const ctx = ctx2d(out, true);
  ctx.fillStyle = rgbToCss(background);
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

/**
 * 4-neighbor flood fill with exact color matching (no tolerance), like Paint.
 * Returns the modified rectangle, or null if nothing changed.
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  sx: number,
  sy: number,
  color: RGB,
): { x: number; y: number; w: number; h: number } | null {
  if (sx < 0 || sy < 0 || sx >= width || sy >= height) return null;
  const img = ctx.getImageData(0, 0, width, height);
  const px = new Uint32Array(img.data.buffer);
  const target = px[sy * width + sx];
  const fill = packRgb(color);
  if (target === fill) return null;
  let minX = sx;
  let maxX = sx;
  let minY = sy;
  let maxY = sy;
  const stack: number[] = [sx, sy];
  while (stack.length) {
    const y = stack.pop() as number;
    let x = stack.pop() as number;
    let i = y * width + x;
    while (x > 0 && px[i - 1] === target) {
      x--;
      i--;
    }
    let spanUp = false;
    let spanDown = false;
    while (x < width && px[i] === target) {
      px[i] = fill;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y > 0) {
        const up = px[i - width] === target;
        if (up && !spanUp) stack.push(x, y - 1);
        spanUp = up;
      }
      if (y < height - 1) {
        const down = px[i + width] === target;
        if (down && !spanDown) stack.push(x, y + 1);
        spanDown = down;
      }
      x++;
      i++;
    }
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const r = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  ctx.putImageData(img, 0, 0, r.x, r.y, r.w, r.h);
  return r;
}
