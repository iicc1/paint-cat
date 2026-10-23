import { describe, expect, it } from 'vitest';
import type { Contour, Point, Rect } from './types';
import { SHAPE_ORDER } from './types';
import {
  constrainAngle45,
  constrainSquare,
  contoursToSvgPath,
  curveContour,
  lineContour,
  polygonContour,
  shapeContours,
  type BoxShapeKind,
} from './shapes';

const BOX_KINDS = SHAPE_ORDER.filter((k): k is BoxShapeKind => k !== 'line' && k !== 'curve' && k !== 'polygon');

const RECTS: Rect[] = [
  { x: 10, y: 20, w: 200, h: 100 },
  { x: 0, y: 0, w: 1, h: 1 },
  { x: 3.5, y: 7.25, w: 13, h: 400 },
  { x: -50, y: 30, w: 1000, h: 1000 },
  { x: 5, y: 5, w: 900, h: 12 },
];

const EPS = 1e-6;

function signedArea(pts: Point[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function bbox(contours: Contour[]): { x0: number; y0: number; x1: number; y1: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const c of contours) {
    for (const p of c.points) {
      x0 = Math.min(x0, p.x);
      y0 = Math.min(y0, p.y);
      x1 = Math.max(x1, p.x);
      y1 = Math.max(y1, p.y);
    }
  }
  return { x0, y0, x1, y1 };
}

describe('shapeContours', () => {
  it('covers the 20 box shapes of the gallery', () => {
    expect(BOX_KINDS).toHaveLength(20);
  });

  for (const kind of BOX_KINDS) {
    describe(`shape ${kind}`, () => {
      it('returns closed contours with every point inside the rect', () => {
        for (const r of RECTS) {
          const contours = shapeContours(kind, r);
          expect(contours.length).toBeGreaterThanOrEqual(1);
          for (const c of contours) {
            expect(c.closed).toBe(true);
            expect(c.points.length).toBeGreaterThanOrEqual(3);
            for (const p of c.points) {
              expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
              expect(p.x).toBeGreaterThanOrEqual(r.x - EPS);
              expect(p.x).toBeLessThanOrEqual(r.x + r.w + EPS);
              expect(p.y).toBeGreaterThanOrEqual(r.y - EPS);
              expect(p.y).toBeLessThanOrEqual(r.y + r.h + EPS);
            }
          }
        }
      });

      it('fills the rect (touches its four sides)', () => {
        for (const r of RECTS) {
          const b = bbox(shapeContours(kind, r));
          const tol = Math.max(0.06, 0.002 * Math.max(r.w, r.h));
          expect(b.x0 - r.x).toBeLessThanOrEqual(tol);
          expect(b.y0 - r.y).toBeLessThanOrEqual(tol);
          expect(r.x + r.w - b.x1).toBeLessThanOrEqual(tol);
          expect(r.y + r.h - b.y1).toBeLessThanOrEqual(tol);
        }
      });

      it('winds clockwise on screen (positive signed area) without repeating the first point', () => {
        const r = RECTS[0];
        for (const c of shapeContours(kind, r)) {
          expect(signedArea(c.points)).toBeGreaterThan(0);
          const first = c.points[0];
          const last = c.points[c.points.length - 1];
          expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(1e-9);
        }
      });

      it('returns [] for an empty rect', () => {
        expect(shapeContours(kind, { x: 10, y: 10, w: 0, h: 0 })).toEqual([]);
        expect(shapeContours(kind, { x: 10, y: 10, w: 50, h: 0 })).toEqual([]);
        expect(shapeContours(kind, { x: 10, y: 10, w: 0, h: 50 })).toEqual([]);
      });
    });
  }

  it('has the expected vertex counts for polygonal shapes', () => {
    const r = { x: 0, y: 0, w: 100, h: 80 };
    const count = (k: BoxShapeKind): number => shapeContours(k, r)[0].points.length;
    expect(count('rectangle')).toBe(4);
    expect(count('triangle')).toBe(3);
    expect(count('rightTriangle')).toBe(3);
    expect(count('diamond')).toBe(4);
    expect(count('pentagon')).toBe(5);
    expect(count('hexagon')).toBe(6);
    expect(count('arrowRight')).toBe(7);
    expect(count('arrowLeft')).toBe(7);
    expect(count('arrowUp')).toBe(7);
    expect(count('arrowDown')).toBe(7);
    expect(count('star4')).toBe(8);
    expect(count('star5')).toBe(10);
    expect(count('star6')).toBe(12);
    expect(count('lightning')).toBe(11);
  });

  it('places key vertices like Paint', () => {
    const r = { x: 0, y: 0, w: 100, h: 100 };
    const pts = (k: BoxShapeKind): Point[] => shapeContours(k, r)[0].points;
    // Isosceles triangle with the apex at top center.
    expect(pts('triangle')).toContainEqual({ x: 50, y: 0 });
    // Right triangle: right angle at bottom left, apex at top left.
    expect(pts('rightTriangle')).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ]);
    // Pentagon, stars and hexagon with a vertex at top center.
    for (const k of ['pentagon', 'hexagon', 'star5', 'star6', 'star4'] as const) {
      const top = pts(k)[0];
      expect(top.x).toBeCloseTo(50, 9);
      expect(top.y).toBeCloseTo(0, 9);
    }
    // 4-point star: points up, right, down and left.
    const s4 = pts('star4');
    expect(s4[2].x).toBeCloseTo(100, 9);
    expect(s4[2].y).toBeCloseTo(50, 9);
    expect(s4[4].y).toBeCloseTo(100, 9);
    expect(s4[6].x).toBeCloseTo(0, 9);
    // Right arrow: tip at the middle of the right side.
    expect(pts('arrowRight')).toContainEqual({ x: 100, y: 50 });
  });

  it('makes star inner vertices alternate with outer ones', () => {
    const r = { x: 0, y: 0, w: 200, h: 200 };
    const s5 = shapeContours('star5', r)[0].points;
    const c = { x: 100, y: 100 * (1 + (1 - Math.cos(Math.PI / 5)) / (1 + Math.cos(Math.PI / 5))) };
    const d = s5.map((p) => Math.hypot(p.x - c.x, p.y - c.y));
    for (let i = 0; i < 10; i += 2) expect(d[i]).toBeGreaterThan(d[i + 1] * 2);
  });

  it('keeps the callout body in the top 80 % and the tail reaching the bottom-left', () => {
    const r = { x: 0, y: 0, w: 200, h: 100 };
    for (const k of ['calloutRoundRect', 'calloutEllipse'] as const) {
      const pts = shapeContours(k, r)[0].points;
      const below = pts.filter((p) => p.y > 80 + 1e-9);
      expect(below.length).toBe(1); // only the tip of the tail
      expect(below[0].y).toBeCloseTo(100, 9);
      expect(below[0].x).toBeLessThan(50);
    }
  });

  it('builds the cloud callout from a bumpy body plus separate bubbles', () => {
    const r = { x: 0, y: 0, w: 300, h: 200 };
    const contours = shapeContours('calloutCloud', r);
    expect(contours.length).toBeGreaterThanOrEqual(3);
    expect(contours.length).toBeLessThanOrEqual(4);
    const [body, ...bubbles] = contours;
    const bb = bbox([body]);
    expect(bb.y1).toBeLessThanOrEqual(r.h * 0.8 + EPS);
    // Bubbles getting smaller and further toward the bottom left.
    let prev = bbox([body]);
    for (const b of bubbles) {
      const bx = bbox([b]);
      expect(bx.x1 - bx.x0).toBeLessThan(prev.x1 - prev.x0);
      expect(bx.y0).toBeGreaterThan(prev.y0);
      expect(bx.x0).toBeLessThan(r.w / 2);
      prev = bx;
    }
    // Bumpy outline: the distance to the center oscillates (several local maxima).
    const cx = (bb.x0 + bb.x1) / 2;
    const cy = (bb.y0 + bb.y1) / 2;
    const d = body.points.map((p) => Math.hypot((p.x - cx) / (bb.x1 - bb.x0), (p.y - cy) / (bb.y1 - bb.y0)));
    let minima = 0;
    for (let i = 0; i < d.length; i++) {
      const a = d[(i - 1 + d.length) % d.length];
      const c = d[(i + 1) % d.length];
      if (d[i] < a && d[i] < c) minima++;
    }
    expect(minima).toBeGreaterThanOrEqual(8);
  });

  it('builds a symmetric heart', () => {
    const r = { x: 0, y: 0, w: 120, h: 100 };
    const pts = shapeContours('heart', r)[0].points;
    for (const p of pts) {
      const mirrored = { x: 120 - p.x, y: p.y };
      const nearest = Math.min(...pts.map((q) => Math.hypot(q.x - mirrored.x, q.y - mirrored.y)));
      expect(nearest).toBeLessThan(1e-6);
    }
    // Tip at bottom center.
    expect(pts.some((p) => Math.abs(p.x - 60) < 1e-9 && Math.abs(p.y - 100) < 1e-9)).toBe(true);
  });

  it('adapts the flattening to the size', () => {
    const small = shapeContours('ellipse', { x: 0, y: 0, w: 10, h: 10 })[0].points.length;
    const big = shapeContours('ellipse', { x: 0, y: 0, w: 1000, h: 1000 })[0].points.length;
    expect(small).toBeGreaterThanOrEqual(8);
    expect(small).toBeLessThan(64);
    expect(big).toBeGreaterThan(small);
    expect(big).toBeLessThanOrEqual(1024);
    // Enough for 8×: the sagitta of each chord (radius 500) is less than 0.1 px.
    const sagitta = 500 * (1 - Math.cos(Math.PI / big));
    expect(sagitta).toBeLessThan(0.1);
    for (const k of BOX_KINDS) {
      const n = shapeContours(k, { x: 0, y: 0, w: 1000, h: 1000 }).reduce((s, c) => s + c.points.length, 0);
      expect(n).toBeLessThan(3000);
    }
  });

  it('gives rounded rectangles a radius of 1/6 of the smaller side', () => {
    const pts = shapeContours('roundRect', { x: 0, y: 0, w: 300, h: 60 })[0].points;
    // The straight runs of the top edge start 10 px (60 / 6) from the corners.
    const top = pts.filter((p) => Math.abs(p.y) < 1e-9).map((p) => p.x);
    expect(Math.min(...top)).toBeCloseTo(10, 9);
    expect(Math.max(...top)).toBeCloseTo(290, 9);
  });
});

describe('line, curve and polygon contours', () => {
  it('lineContour is an open two-point contour', () => {
    const a = { x: 1, y: 2 };
    const b = { x: 30, y: -4 };
    const c = lineContour(a, b);
    expect(c).toEqual({ points: [a, b], closed: false });
    expect(c.points[0]).not.toBe(a);
  });

  it('curveContour goes from a to b and is flattened adaptively', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 300, y: 0 };
    const c = curveContour(a, b, { x: 100, y: 200 }, { x: 200, y: -200 });
    expect(c.closed).toBe(false);
    expect(c.points[0]).toEqual(a);
    expect(c.points[c.points.length - 1]).toEqual(b);
    expect(c.points.length).toBeGreaterThan(20);
    const tiny = curveContour(a, { x: 3, y: 0 }, { x: 1, y: 2 }, { x: 2, y: -2 });
    expect(tiny.points.length).toBeLessThan(c.points.length);
    // With the control points on the line, the curve is the line.
    const straight = curveContour(a, b, { x: 100, y: 0 }, { x: 200, y: 0 });
    expect(straight.points.every((p) => Math.abs(p.y) < 1e-9)).toBe(true);
    expect(straight.points).toHaveLength(2);
  });

  it('polygonContour copies the points', () => {
    const pts = [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 8 },
    ];
    const c = polygonContour(pts, true);
    expect(c).toEqual({ points: pts, closed: true });
    expect(c.points).not.toBe(pts);
    expect(c.points[0]).not.toBe(pts[0]);
    expect(polygonContour(pts, false).closed).toBe(false);
  });
});

describe('contoursToSvgPath', () => {
  it('writes M/L/Z commands per contour', () => {
    const path = contoursToSvgPath([
      {
        points: [
          { x: 0, y: 0 },
          { x: 10.5, y: 0 },
          { x: 5, y: 8.25 },
        ],
        closed: true,
      },
      {
        points: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
        closed: false,
      },
    ]);
    expect(path).toBe('M0 0 L10.5 0 L5 8.25 Z M1 2 L3 4');
  });

  it('rounds to the given precision and never prints -0', () => {
    const c: Contour = {
      points: [
        { x: 1.23456, y: -0.0001 },
        { x: 2, y: 3.999 },
      ],
      closed: false,
    };
    expect(contoursToSvgPath([c])).toBe('M1.23 0 L2 4');
    expect(contoursToSvgPath([c], 3)).toBe('M1.235 0 L2 3.999');
    expect(contoursToSvgPath([c], 0)).toBe('M1 0 L2 4');
  });

  it('skips empty contours', () => {
    expect(contoursToSvgPath([{ points: [], closed: true }])).toBe('');
  });

  it('serializes every gallery shape', () => {
    for (const k of BOX_KINDS) {
      const d = contoursToSvgPath(shapeContours(k, { x: 1, y: 1, w: 19, h: 19 }), 1);
      expect(d).toMatch(/^M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+ Z( M[\d.]+ [\d.]+( L[\d.]+ [\d.]+)+ Z)*$/);
    }
  });
});

describe('Shift constraints', () => {
  const s = { x: 10, y: 20 };

  it('constrainSquare makes |dx| == |dy| keeping the signs', () => {
    expect(constrainSquare(s, { x: 40, y: 30 })).toEqual({ x: 40, y: 50 });
    expect(constrainSquare(s, { x: 0, y: 60 })).toEqual({ x: -30, y: 60 });
    expect(constrainSquare(s, { x: 5, y: -10 })).toEqual({ x: -20, y: -10 });
    expect(constrainSquare(s, { x: 35, y: 20 })).toEqual({ x: 35, y: 45 });
    expect(constrainSquare(s, s)).toEqual(s);
  });

  it('constrainAngle45 snaps to the nearest multiple of 45°', () => {
    expect(constrainAngle45(s, { x: 110, y: 25 })).toEqual({ x: 110, y: 20 }); // horizontal
    expect(constrainAngle45(s, { x: -90, y: 15 })).toEqual({ x: -90, y: 20 });
    expect(constrainAngle45(s, { x: 14, y: 120 })).toEqual({ x: 10, y: 120 }); // vertical
    expect(constrainAngle45(s, { x: 8, y: -80 })).toEqual({ x: 10, y: -80 });
    expect(constrainAngle45(s, { x: 60, y: 60 })).toEqual({ x: 55, y: 65 }); // 45°: average of |dx| and |dy|
    expect(constrainAngle45(s, { x: -40, y: -20 })).toEqual({ x: -35, y: -25 }); // -135°
    expect(constrainAngle45(s, { x: 50, y: -20 })).toEqual({ x: 50, y: -20 }); // exactly -45°
    expect(constrainAngle45(s, s)).toEqual(s);
  });

  it('constrainAngle45 output is always at an exact multiple of 45°', () => {
    for (let i = 0; i < 360; i += 7) {
      const a = (i * Math.PI) / 180;
      const e = constrainAngle45(s, { x: s.x + Math.cos(a) * 100, y: s.y + Math.sin(a) * 100 });
      const dx = e.x - s.x;
      const dy = e.y - s.y;
      expect(dx === 0 || dy === 0 || Math.abs(Math.abs(dx) - Math.abs(dy)) < 1e-9).toBe(true);
    }
  });
});
