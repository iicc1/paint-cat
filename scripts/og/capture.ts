/**
 * Sample scene used to generate public/og-image.png and docs/screenshot.png (development only).
 *   1. docker compose up
 *   2. Capture http://localhost:5173/scripts/og/capture.html at 1280×800 with a headless browser.
 *   3. Compose the capture with scripts/og/compose.html (see the README in this folder).
 */
import '../../src/main';
import type { App } from '../../src/app/app';
import { beginBrushStroke, fillContours, strokeContours } from '../../src/paint/brushes';
import { shapeContours } from '../../src/paint/shapes';
import type { BrushKind, RGB } from '../../src/paint/types';

const app = (window as unknown as { paintcat: App }).paintcat;
// The image is in English, the default language, whatever the headless browser's language is.
app.store.set({ lang: 'en' });
// Fixed size (in a headless browser the "screen" is small, and so is the default canvas).
const blank = document.createElement('canvas');
blank.width = 1043;
blank.height = 587;
app.doc.reset(blank);
const ctx = app.doc.ctx;
const W = app.doc.width;
const H = app.doc.height;

/** Same as the Brushes tool: stroke layer + blend with the brush opacity. */
function stroke(kind: BrushKind, size: number, color: RGB, pts: [number, number][]): void {
  const layer = app.beginStroke(1);
  const s = beginBrushStroke(kind, layer, pts[0][0], pts[0][1], size, color, 7);
  app.strokeAlpha = s.layerAlpha;
  for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
  app.endStroke({ x: 0, y: 0, w: W, h: H });
}

function wave(x0: number, y0: number, len: number, amp: number, steps = 60): [number, number][] {
  return Array.from({ length: steps + 1 }, (_, i) => [
    x0 + (len * i) / steps,
    y0 + amp * Math.sin((i / steps) * Math.PI * 2),
  ]);
}

// Sky and grass
ctx.fillStyle = '#99d9ea';
ctx.fillRect(0, 0, W, H * 0.62);
ctx.fillStyle = '#b5e61d';
ctx.fillRect(0, H * 0.62, W, H * 0.38);

// Sun
fillContours('solid', ctx, shapeContours('ellipse', { x: W - 210, y: 40, w: 130, h: 130 }), [255, 242, 0]);
strokeContours('solid', ctx, shapeContours('ellipse', { x: W - 210, y: 40, w: 130, h: 130 }), 5, [255, 127, 39]);

// A cat sitting on the grass
const OUTLINE: RGB = [0, 0, 0];
const ORANGE: RGB = [255, 127, 39];
const PINK: RGB = [255, 174, 201];
const shape = (
  kind: Parameters<typeof shapeContours>[0],
  r: { x: number; y: number; w: number; h: number },
  fill: RGB,
  width = 3,
): void => {
  fillContours('solid', ctx, shapeContours(kind, r), fill);
  strokeContours('solid', ctx, shapeContours(kind, r), width, OUTLINE);
};
const line = (pts: [number, number][], width = 3): void => {
  ctx.beginPath();
  ctx.moveTo(...pts[0]);
  for (const p of pts.slice(1)) ctx.lineTo(...p);
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000';
  ctx.stroke();
};
const tail: [number, number][] = Array.from({ length: 30 }, (_, k) => {
  const a = (k / 29) * Math.PI * 0.95;
  return [380 + 45 * Math.sin(a) + k * 1.2, 410 - 130 * (k / 29) + 12 * Math.sin(a * 2)];
});
stroke('oil', 26, [217, 95, 20], tail);
shape('ellipse', { x: 215, y: 270, w: 180, h: 160 }, ORANGE);
shape('ellipse', { x: 262, y: 320, w: 86, h: 96 }, [255, 255, 255], 2);
shape('ellipse', { x: 236, y: 400, w: 56, h: 32 }, [255, 255, 255]);
shape('ellipse', { x: 318, y: 400, w: 56, h: 32 }, [255, 255, 255]);
shape('triangle', { x: 228, y: 128, w: 60, h: 72 }, ORANGE);
shape('triangle', { x: 322, y: 128, w: 60, h: 72 }, ORANGE);
shape('triangle', { x: 244, y: 150, w: 28, h: 38 }, PINK, 2);
shape('triangle', { x: 338, y: 150, w: 28, h: 38 }, PINK, 2);
shape('ellipse', { x: 218, y: 162, w: 174, h: 140 }, ORANGE);
shape('ellipse', { x: 252, y: 200, w: 36, h: 42 }, [34, 177, 76]);
shape('ellipse', { x: 322, y: 200, w: 36, h: 42 }, [34, 177, 76]);
shape('ellipse', { x: 264, y: 206, w: 12, h: 30 }, OUTLINE, 1);
shape('ellipse', { x: 334, y: 206, w: 12, h: 30 }, OUTLINE, 1);
shape('heart', { x: 294, y: 248, w: 22, h: 18 }, PINK, 2);
line([
  [305, 266],
  [305, 274],
  [294, 282],
]);
line([
  [305, 274],
  [316, 282],
]);
line(
  [
    [284, 258],
    [226, 248],
  ],
  2,
);
line(
  [
    [284, 266],
    [224, 270],
  ],
  2,
);
line(
  [
    [326, 258],
    [384, 248],
  ],
  2,
);
line(
  [
    [326, 266],
    [386, 270],
  ],
  2,
);

// House
fillContours('solid', ctx, shapeContours('rectangle', { x: 620, y: 230, w: 200, h: 140 }), [255, 255, 255]);
strokeContours('solid', ctx, shapeContours('rectangle', { x: 620, y: 230, w: 200, h: 140 }), 4, [0, 0, 0]);
fillContours('solid', ctx, shapeContours('triangle', { x: 600, y: 140, w: 240, h: 92 }), [237, 28, 36]);
strokeContours('solid', ctx, shapeContours('triangle', { x: 600, y: 140, w: 240, h: 92 }), 4, [136, 0, 21]);
fillContours('solid', ctx, shapeContours('rectangle', { x: 700, y: 290, w: 44, h: 80 }), [185, 122, 87]);
fillContours('solid', ctx, shapeContours('rectangle', { x: 640, y: 255, w: 40, h: 36 }), [153, 217, 234]);
strokeContours('solid', ctx, shapeContours('rectangle', { x: 640, y: 255, w: 40, h: 36 }), 3, [63, 72, 204]);

// Heart, star and cloud
fillContours('solid', ctx, shapeContours('heart', { x: 60, y: 380, w: 90, h: 80 }), [255, 174, 201]);
strokeContours('solid', ctx, shapeContours('heart', { x: 60, y: 380, w: 90, h: 80 }), 3, [237, 28, 36]);
fillContours('solid', ctx, shapeContours('star5', { x: 880, y: 360, w: 110, h: 105 }), [255, 201, 14]);
strokeContours('solid', ctx, shapeContours('star5', { x: 880, y: 360, w: 110, h: 105 }), 3, [255, 127, 39]);
fillContours('solid', ctx, shapeContours('calloutCloud', { x: 360, y: 40, w: 210, h: 120 }), [255, 255, 255]);
strokeContours('solid', ctx, shapeContours('calloutCloud', { x: 360, y: 40, w: 210, h: 120 }), 3, [112, 146, 190]);

// Brush strokes
stroke('oil', 30, [34, 177, 76], wave(40, H - 70, 320, 18));
stroke('crayon', 16, [163, 73, 164], wave(420, H - 60, 260, 14));
stroke('watercolor', 30, [0, 162, 232], wave(700, H - 70, 300, 16));

// Text
ctx.fillStyle = '#3f48cc';
ctx.font = 'italic 700 34px Calibri, "Segoe UI", sans-serif';
ctx.fillText('Meow!', 405, 108);

app.doc.commit({ x: 0, y: 0, w: W, h: H });
app.markDirty();
// A selection around the star, so Paint's typical handles show.
app.setTool('select');
app.selection.setRect({ x: 868, y: 350, w: 134, h: 126 });
app.invalidate();
document.title = 'ready';
