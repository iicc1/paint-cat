/**
 * Pure geometry of Paint's 23 shapes. Everything is returned as polygonal contours
 * (curves already flattened), in document coordinates.
 *
 * Conventions:
 * - "Box" shapes fit the given rectangle and all their points lie inside it.
 * - Closed contours do not repeat the first point at the end and run clockwise
 *   on screen (Y axis pointing down), so their signed area is positive.
 * - Flattening is adaptive: the maximum deviation from the ideal curve is FLAT_TOL px.
 */
import type { Contour, Point, Rect, ShapeKind } from './types';

export type BoxShapeKind = Exclude<ShapeKind, 'line' | 'curve' | 'polygon'>;

/** Maximum chord error when flattening (document px): 0.05 px ≈ 0.4 screen px at 8×. */
const FLAT_TOL = 0.05;
const MAX_CIRCLE_SEGMENTS = 1024;
const MAX_CUBIC_SEGMENTS = 512;

/** Fraction of the height taken by the callout body (the rest is the tail). */
const CALLOUT_BODY = 0.8;

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Segments for a full circle of that radius. */
function circleSegments(radius: number): number {
  if (!(radius > 0)) return 8;
  return clamp(Math.ceil(Math.PI * Math.sqrt(radius / (2 * FLAT_TOL))), 8, MAX_CIRCLE_SEGMENTS);
}

function arcSegments(radius: number, sweep: number): number {
  return Math.max(1, Math.ceil((circleSegments(radius) * Math.abs(sweep)) / TAU));
}

/** Clamps a point to the rectangle (avoids rounding errors at the edges). */
function inRect(r: Rect, x: number, y: number): Point {
  return { x: clamp(x, r.x, r.x + r.w), y: clamp(y, r.y, r.y + r.h) };
}

function closed(points: Point[]): Contour {
  return { points, closed: true };
}

/** Polygon defined in unit coordinates [0,1]² (flat list u0, v0, u1, v1…). */
function unitPolygon(r: Rect, uv: readonly number[]): Contour {
  const pts: Point[] = [];
  for (let i = 0; i < uv.length; i += 2) pts.push(inRect(r, r.x + uv[i] * r.w, r.y + uv[i + 1] * r.h));
  return closed(pts);
}

/** Rescales a list of points so that their bounding box matches the rectangle. */
function fitToRect(pts: Point[], r: Rect): Point[] {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of pts) {
    if (p.x < x0) x0 = p.x;
    if (p.y < y0) y0 = p.y;
    if (p.x > x1) x1 = p.x;
    if (p.y > y1) y1 = p.y;
  }
  const sx = x1 > x0 ? r.w / (x1 - x0) : 0;
  const sy = y1 > y0 ? r.h / (y1 - y0) : 0;
  return pts.map((p) => inRect(r, r.x + (p.x - x0) * sx, r.y + (p.y - y0) * sy));
}

/**
 * Regular polygon (or star if innerRatio > 0) with the first vertex at the top, stretched to the box.
 * For a star, outer (radius 1) and inner (radius innerRatio) vertices alternate.
 */
function regular(r: Rect, n: number, innerRatio = 0): Contour {
  const pts: Point[] = [];
  const steps = innerRatio > 0 ? n * 2 : n;
  for (let i = 0; i < steps; i++) {
    const a = -Math.PI / 2 + (i * TAU) / steps;
    const rad = innerRatio > 0 && i % 2 === 1 ? innerRatio : 1;
    pts.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad });
  }
  return closed(fitToRect(pts, r));
}

/** Points of an ellipse arc from a0 to a1 (radians, clockwise on screen if a1 > a0). */
function arcPoints(
  out: Point[],
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  a0: number,
  a1: number,
  includeStart: boolean,
): void {
  const n = arcSegments(Math.max(rx, ry), a1 - a0);
  for (let i = includeStart ? 0 : 1; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
}

/** Flattens a cubic (Wang's formula: segment count from the curvature of the control polygon). */
function flattenCubic(out: Point[], p0: Point, p1: Point, p2: Point, p3: Point, includeStart: boolean): void {
  const ddx1 = p0.x - 2 * p1.x + p2.x;
  const ddy1 = p0.y - 2 * p1.y + p2.y;
  const ddx2 = p1.x - 2 * p2.x + p3.x;
  const ddy2 = p1.y - 2 * p2.y + p3.y;
  const m = Math.max(Math.hypot(ddx1, ddy1), Math.hypot(ddx2, ddy2));
  const n = clamp(Math.ceil(Math.sqrt((0.75 * m) / FLAT_TOL)), 1, MAX_CUBIC_SEGMENTS);
  for (let i = includeStart ? 0 : 1; i <= n; i++) {
    const t = i / n;
    const mt = 1 - t;
    const a = mt * mt * mt;
    const b = 3 * mt * mt * t;
    const c = 3 * mt * t * t;
    const d = t * t * t;
    out.push({ x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y });
  }
}

// ---------------------------------------------------------------------------------------------
// Curved shapes

function ellipse(r: Rect): Contour {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rx = r.w / 2;
  const ry = r.h / 2;
  // Multiple of 4 to touch the four sides of the box exactly.
  const n = Math.max(8, Math.ceil(circleSegments(Math.max(rx, ry)) / 4) * 4);
  const pts: Point[] = [];
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i * TAU) / n;
    pts.push(inRect(r, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
  }
  return closed(pts);
}

/** Rounded rectangle; `tail` (optional) inserts the callout tail on the bottom edge. */
function roundRectPoints(r: Rect, tail?: readonly Point[]): Point[] {
  const { x, y, w, h } = r;
  const rad = Math.min(w, h) / 6;
  const pts: Point[] = [];
  arcPoints(pts, x + rad, y + rad, rad, rad, Math.PI, Math.PI * 1.5, true); // top-left
  arcPoints(pts, x + w - rad, y + rad, rad, rad, Math.PI * 1.5, TAU, true); // top-right
  arcPoints(pts, x + w - rad, y + h - rad, rad, rad, 0, Math.PI / 2, true); // bottom-right
  if (tail) pts.push(...tail);
  arcPoints(pts, x + rad, y + h - rad, rad, rad, Math.PI / 2, Math.PI, true); // bottom-left
  return pts;
}

function roundRect(r: Rect): Contour {
  return closed(roundRectPoints(r).map((p) => inRect(r, p.x, p.y)));
}

function calloutRoundRect(r: Rect): Contour {
  const body: Rect = { x: r.x, y: r.y, w: r.w, h: r.h * CALLOUT_BODY };
  const by = body.y + body.h;
  // The tail starts on the bottom edge (between 20 % and 36 % of the width) and points down-left.
  const tail: Point[] = [
    { x: r.x + r.w * 0.36, y: by },
    { x: r.x + r.w * 0.16, y: r.y + r.h },
    { x: r.x + r.w * 0.2, y: by },
  ];
  return closed(roundRectPoints(body, tail).map((p) => inRect(r, p.x, p.y)));
}

function calloutEllipse(r: Rect): Contour {
  const bh = r.h * CALLOUT_BODY;
  const cx = r.x + r.w / 2;
  const cy = r.y + bh / 2;
  const rx = r.w / 2;
  const ry = bh / 2;
  // Angles (screen, 90° = down) where the tail leaves the ellipse, in the lower-left quadrant.
  const a1 = 106 * DEG;
  const a2 = 133 * DEG;
  const pts: Point[] = [];
  arcPoints(pts, cx, cy, rx, ry, a2, a1 + TAU, true);
  pts.push({ x: r.x + r.w * 0.1, y: r.y + r.h });
  return closed(pts.map((p) => inRect(r, p.x, p.y)));
}

/** Cloud valleys (degrees, clockwise from the right) and relative bulge of each arc. */
const CLOUD_VALLEYS = [-98, -62, -30, -2, 28, 58, 92, 122, 150, 184, 218] as const;
const CLOUD_BULGE = [0.46, 0.42, 0.44, 0.4, 0.45, 0.42, 0.44, 0.4, 0.46, 0.43, 0.45] as const;

function cloudBody(r: Rect): Point[] {
  // Laid out on a unit circle (scaled to approximate pixels to decide the flattening density).
  const scale = Math.max(r.w, r.h) / 2;
  const vx = CLOUD_VALLEYS.map((d) => Math.cos(d * DEG));
  const vy = CLOUD_VALLEYS.map((d) => Math.sin(d * DEG));
  const pts: Point[] = [];
  const n = CLOUD_VALLEYS.length;
  for (let k = 0; k < n; k++) {
    const ax = vx[k];
    const ay = vy[k];
    const bx = vx[(k + 1) % n];
    const by = vy[(k + 1) % n];
    const dx = bx - ax;
    const dy = by - ay;
    const c = Math.hypot(dx, dy);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    // Outward normal of the chord (clockwise traversal → the outward one is (dy, -dx) rotated).
    let nx = dy / c;
    let ny = -dx / c;
    if (nx * mx + ny * my < 0) {
      nx = -nx;
      ny = -ny;
    }
    const s = CLOUD_BULGE[k] * c; // sagitta
    const rho = (c * c) / 4 / (2 * s) + s / 2; // arc radius
    const ox = mx + nx * (s - rho);
    const oy = my + ny * (s - rho);
    const a0 = Math.atan2(ay - oy, ax - ox);
    let a1 = Math.atan2(by - oy, bx - ox);
    // The short arc (the one through the outer vertex) runs clockwise: a1 > a0.
    while (a1 <= a0) a1 += TAU;
    if (a1 - a0 > Math.PI) a1 -= TAU;
    const segs = arcSegments(rho * scale, a1 - a0);
    for (let i = 0; i < segs; i++) {
      const a = a0 + ((a1 - a0) * i) / segs;
      pts.push({ x: ox + Math.cos(a) * rho, y: oy + Math.sin(a) * rho });
    }
  }
  return pts;
}

/** Cloud bubbles: center and radius as fractions of the box (shrinking toward the bottom left). */
const CLOUD_BUBBLES = [
  { u: 0.25, v: 0.855, r: 0.04 },
  { u: 0.165, v: 0.925, r: 0.028 },
  { u: 0.1, v: 0.98, r: 0.02 },
] as const;

function calloutCloud(r: Rect): Contour[] {
  const body = fitToRect(cloudBody(r), { x: r.x, y: r.y, w: r.w, h: r.h * 0.8 });
  const out: Contour[] = [closed(body)];
  for (const b of CLOUD_BUBBLES) {
    const cx = r.x + b.u * r.w;
    const cy = r.y + b.v * r.h;
    const rx = b.r * r.w;
    const ry = b.r * r.h;
    const n = Math.max(8, Math.ceil(circleSegments(Math.max(rx, ry)) / 4) * 4);
    const pts: Point[] = [];
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i * TAU) / n;
      pts.push(inRect(r, cx + Math.cos(a) * rx, cy + Math.sin(a) * ry));
    }
    out.push(closed(pts));
  }
  return out;
}

/** Heart: two lobes of cubics, symmetric; defined in [0,1]² (control points included). */
const HEART_RIGHT: readonly (readonly [number, number])[] = [
  [0.5, 0.2],
  [0.52, 0.06],
  [0.64, 0],
  [0.765, 0],
  [0.9, 0],
  [1, 0.11],
  [1, 0.28],
  [1, 0.53],
  [0.74, 0.73],
  [0.5, 1],
];

function heart(r: Rect): Contour {
  const map = (u: number, v: number): Point => ({ x: r.x + u * r.w, y: r.y + v * r.h });
  const right = HEART_RIGHT.map(([u, v]) => map(u, v));
  // Left half: the mirror image, traversed from the tip to the notch.
  const left = HEART_RIGHT.toReversed().map(([u, v]) => map(1 - u, v));
  const pts: Point[] = [];
  for (const half of [right, left]) {
    for (let i = 0; i + 3 < half.length; i += 3)
      flattenCubic(pts, half[i], half[i + 1], half[i + 2], half[i + 3], false);
  }
  return closed(pts.map((p) => inRect(r, p.x, p.y)));
}

// ---------------------------------------------------------------------------------------------
// Polygonal shapes (unit coordinates)

const TRIANGLE = [0.5, 0, 1, 1, 0, 1];
const RIGHT_TRIANGLE = [0, 0, 1, 1, 0, 1];
const DIAMOND = [0.5, 0, 1, 0.5, 0.5, 1, 0, 0.5];
const RECTANGLE = [0, 0, 1, 0, 1, 1, 0, 1];
// Arrows: shaft 50 % of the cross width, head 50 % of the length.
const ARROW_RIGHT = [0, 0.25, 0.5, 0.25, 0.5, 0, 1, 0.5, 0.5, 1, 0.5, 0.75, 0, 0.75];
const ARROW_LEFT = [0, 0.5, 0.5, 0, 0.5, 0.25, 1, 0.25, 1, 0.75, 0.5, 0.75, 0.5, 1];
const ARROW_UP = [0.5, 0, 1, 0.5, 0.75, 0.5, 0.75, 1, 0.25, 1, 0.25, 0.5, 0, 0.5];
const ARROW_DOWN = [0.25, 0, 0.75, 0, 0.75, 0.5, 1, 0.5, 0.5, 1, 0, 0.5, 0.25, 0.5];
// Zigzag lightning bolt from top left to bottom right (11 vertices).
const LIGHTNING = [
  0.39, 0, 0.6, 0.28, 0.51, 0.315, 0.77, 0.555, 0.685, 0.595, 1, 1, 0.465, 0.69, 0.565, 0.645, 0.235, 0.45, 0.355,
  0.385, 0, 0.18,
];

/**
 * Contours of a "box" shape fitted to rectangle r (w, h >= 0).
 * Not for 'line' | 'curve' | 'polygon'. Returns [] if the rectangle is empty.
 */
export function shapeContours(kind: BoxShapeKind, r: Rect): Contour[] {
  if (!(r.w > 0 && r.h > 0) || !Number.isFinite(r.x + r.y + r.w + r.h)) return [];
  switch (kind) {
    case 'ellipse':
      return [ellipse(r)];
    case 'rectangle':
      return [unitPolygon(r, RECTANGLE)];
    case 'roundRect':
      return [roundRect(r)];
    case 'triangle':
      return [unitPolygon(r, TRIANGLE)];
    case 'rightTriangle':
      return [unitPolygon(r, RIGHT_TRIANGLE)];
    case 'diamond':
      return [unitPolygon(r, DIAMOND)];
    case 'pentagon':
      return [regular(r, 5)];
    case 'hexagon':
      // Like the Paint icon: vertices at top and bottom, vertical sides on the left and right.
      return [regular(r, 6)];
    case 'arrowRight':
      return [unitPolygon(r, ARROW_RIGHT)];
    case 'arrowLeft':
      return [unitPolygon(r, ARROW_LEFT)];
    case 'arrowUp':
      return [unitPolygon(r, ARROW_UP)];
    case 'arrowDown':
      return [unitPolygon(r, ARROW_DOWN)];
    case 'star4':
      return [regular(r, 4, 0.4)];
    case 'star5':
      return [regular(r, 5, 0.38)];
    case 'star6':
      // 1/√3: the sides line up as in the hexagram of the Paint icon.
      return [regular(r, 6, 1 / Math.sqrt(3))];
    case 'calloutRoundRect':
      return [calloutRoundRect(r)];
    case 'calloutEllipse':
      return [calloutEllipse(r)];
    case 'calloutCloud':
      return calloutCloud(r);
    case 'heart':
      return [heart(r)];
    case 'lightning':
      return [unitPolygon(r, LIGHTNING)];
    default:
      return [];
  }
}

/** Straight line (open contour). */
export function lineContour(a: Point, b: Point): Contour {
  return {
    points: [
      { x: a.x, y: a.y },
      { x: b.x, y: b.y },
    ],
    closed: false,
  };
}

/** Cubic Bézier curve from a to b with control points c1 and c2 (open, flattened). */
export function curveContour(a: Point, b: Point, c1: Point, c2: Point): Contour {
  const points: Point[] = [];
  flattenCubic(points, a, c1, c2, b, true);
  return { points, closed: false };
}

/** Polygon from its vertices (copies the points). */
export function polygonContour(points: Point[], isClosed: boolean): Contour {
  return { points: points.map((p) => ({ x: p.x, y: p.y })), closed: isClosed };
}

/** Path2D with one subpath per contour (moveTo/lineTo, and closePath if closed). */
export function contoursToPath2D(contours: Contour[]): Path2D {
  const path = new Path2D();
  for (const c of contours) {
    const pts = c.points;
    if (pts.length === 0) continue;
    path.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) path.lineTo(pts[i].x, pts[i].y);
    if (c.closed) path.closePath();
  }
  return path;
}

function fmt(v: number, precision: number): string {
  const s = v.toFixed(precision);
  const t = s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
  return t === '-0' ? '0' : t;
}

/** SVG path data ("M x y L x y … Z") for the gallery icons. */
export function contoursToSvgPath(contours: Contour[], precision = 2): string {
  const parts: string[] = [];
  for (const c of contours) {
    if (c.points.length === 0) continue;
    const seg = c.points.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x, precision)} ${fmt(p.y, precision)}`);
    if (c.closed) seg.push('Z');
    parts.push(seg.join(' '));
  }
  return parts.join(' ');
}

/** Shift while dragging a shape: |dx| == |dy| keeping the signs (square / circle). */
export function constrainSquare(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const d = Math.max(Math.abs(dx), Math.abs(dy));
  return { x: start.x + (dx < 0 ? -d : d), y: start.y + (dy < 0 ? -d : d) };
}

/** Shift while drawing a line: snaps it to the nearest multiple of 45° (projecting the endpoint). */
export function constrainAngle45(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return { x: start.x, y: start.y };
  const octant = ((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
  const ux = [1, 1, 0, -1, -1, -1, 0, 1][octant];
  const uy = [0, 1, 1, 1, 0, -1, -1, -1][octant];
  const diagonal = ux !== 0 && uy !== 0;
  // Projection onto the chosen direction (on a diagonal, the average of |dx| and |dy|).
  const t = diagonal ? (dx * ux + dy * uy) / 2 : dx * ux + dy * uy;
  return { x: start.x + ux * t, y: start.y + uy * t };
}
