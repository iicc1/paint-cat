import { describe, expect, it } from 'vitest';
import type { Rect } from './types';
import { BRUSH_ORDER } from './types';
import { BRUSH_DEFAULT_SIZE, BRUSH_SIZES, beginBrushStroke } from './brushes';
import { PolylineBuilder, runsInRect, type Polyline } from './engine/polyline';

describe('BRUSH_SIZES / BRUSH_DEFAULT_SIZE', () => {
  it('has the sizes of the real "Size" dropdown', () => {
    expect(BRUSH_SIZES).toEqual({
      brush: [1, 3, 5, 8],
      calligraphy1: [3, 5, 8, 10],
      calligraphy2: [3, 5, 8, 10],
      airbrush: [4, 8, 16, 24],
      oil: [8, 16, 30, 40],
      crayon: [8, 16, 30, 40],
      marker: [8, 16, 30, 40],
      naturalPencil: [4, 6, 8, 10],
      watercolor: [8, 16, 30, 40],
    });
  });

  it('has the real default sizes', () => {
    expect(BRUSH_DEFAULT_SIZE).toEqual({
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
  });

  it('covers every brush, with four ascending sizes and a default among them', () => {
    expect(Object.keys(BRUSH_SIZES).toSorted()).toEqual(BRUSH_ORDER.toSorted());
    for (const kind of BRUSH_ORDER) {
      const list = BRUSH_SIZES[kind];
      expect(list).toHaveLength(4);
      for (let i = 1; i < 4; i++) expect(list[i]).toBeGreaterThan(list[i - 1]);
      expect(list).toContain(BRUSH_DEFAULT_SIZE[kind]);
    }
  });

  it('is immutable', () => {
    expect(Object.isFrozen(BRUSH_SIZES)).toBe(true);
    expect(Object.isFrozen(BRUSH_SIZES.brush)).toBe(true);
    expect(Object.isFrozen(BRUSH_DEFAULT_SIZE)).toBe(true);
  });
});

// ---------------------------------------------------------------------------------------------
// happy-dom has no real Canvas 2D: for brushes that only use paths (no auxiliary
// canvases) a fake context that records the calls is enough.

interface Call {
  name: string;
  args: number[];
}

function mockContext(): { ctx: CanvasRenderingContext2D; calls: Call[] } {
  const calls: Call[] = [];
  const state: Record<string, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (prop in target) return target[prop];
      return (...args: number[]) => {
        calls.push({ name: prop, args });
      };
    },
    set(target, prop, value) {
      target[String(prop)] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

function contains(r: Rect | null, x: number, y: number): boolean {
  return r !== null && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function isIntRect(r: Rect | null): boolean {
  return r !== null && [r.x, r.y, r.w, r.h].every(Number.isInteger) && r.w > 0 && r.h > 0;
}

describe('airbrush', () => {
  it('sprays deterministic 1 px dots inside a circle of diameter = size', () => {
    const run = (): Call[] => {
      const { ctx, calls } = mockContext();
      const s = beginBrushStroke('airbrush', ctx, 100, 100, 24, [0, 0, 0], 42);
      expect(s.layerAlpha).toBe(1);
      expect(isIntRect(s.initialDirty)).toBe(true);
      for (let i = 0; i < 5; i++) expect(isIntRect(s.hold())).toBe(true);
      return calls.filter((c) => c.name === 'rect');
    };
    const dots = run();
    expect(dots.length).toBeGreaterThan(100);
    for (const { args } of dots) {
      const [x, y, w, h] = args;
      expect([w, h]).toEqual([1, 1]);
      expect(Number.isInteger(x) && Number.isInteger(y)).toBe(true);
      expect(Math.hypot(x + 0.5 - 100, y + 0.5 - 100)).toBeLessThanOrEqual(12 + 1);
    }
    expect(run()).toEqual(dots);
  });

  it('nearly fills the circle after holding still for about one second', () => {
    for (const size of BRUSH_SIZES.airbrush) {
      const { ctx, calls } = mockContext();
      const s = beginBrushStroke('airbrush', ctx, 50.5, 50.5, size, [0, 0, 0], 7);
      for (let i = 0; i < 33; i++) s.hold();
      const hit = new Set(calls.filter((c) => c.name === 'rect').map((c) => `${c.args[0]},${c.args[1]}`));
      let inside = 0;
      let covered = 0;
      const r = size / 2;
      for (let y = Math.floor(50.5 - r); y <= 50.5 + r; y++) {
        for (let x = Math.floor(50.5 - r); x <= 50.5 + r; x++) {
          if (Math.hypot(x + 0.5 - 50.5, y + 0.5 - 50.5) > r - 0.75) continue;
          inside++;
          if (hit.has(`${x},${y}`)) covered++;
        }
      }
      expect(covered / inside).toBeGreaterThan(0.85);
    }
  });

  it('also sprays along the path and reports the dirty rect', () => {
    const { ctx, calls } = mockContext();
    const s = beginBrushStroke('airbrush', ctx, 10, 10, 16, [255, 0, 0], 1);
    const before = calls.length;
    const r = s.lineTo(110, 10);
    expect(calls.length).toBeGreaterThan(before);
    expect(isIntRect(r)).toBe(true);
    const dots = calls.slice(before).filter((c) => c.name === 'rect');
    expect(dots.length).toBeGreaterThan(100);
    for (const { args } of dots) expect(contains(r, args[0], args[1])).toBe(true);
  });
});

describe('calligraphy', () => {
  /** Area of the last filled polygon (moveTo/lineTo before the last fill). */
  function lastFilledArea(calls: Call[]): number {
    const end = calls.map((c) => c.name).lastIndexOf('fill');
    const start = calls
      .slice(0, end)
      .map((c) => c.name)
      .lastIndexOf('beginPath');
    const pts = calls
      .slice(start, end)
      .filter((c) => c.name === 'moveTo' || c.name === 'lineTo')
      .map((c) => c.args);
    let a = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      a += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(a / 2);
  }

  it('calligraphy1 is thin along "/" and thick across it', () => {
    const { ctx, calls } = mockContext();
    const s = beginBrushStroke('calligraphy1', ctx, 100, 100, 10, [0, 0, 0]);
    expect(isIntRect(s.initialDirty)).toBe(true);
    const r1 = s.lineTo(130, 70); // along "/"
    const along = lastFilledArea(calls);
    const r2 = s.lineTo(160, 100); // across "/"
    const across = lastFilledArea(calls);
    expect(across).toBeGreaterThan(along * 4);
    expect(contains(r1, 100, 100) && contains(r1, 130, 70)).toBe(true);
    expect(contains(r2, 130, 70) && contains(r2, 160, 100)).toBe(true);
    expect(s.hold()).toBeNull();
  });

  it('calligraphy2 is the mirror image ("\\")', () => {
    const { ctx, calls } = mockContext();
    const s = beginBrushStroke('calligraphy2', ctx, 100, 100, 10, [0, 0, 0]);
    s.lineTo(130, 130);
    const along = lastFilledArea(calls);
    s.lineTo(160, 100);
    const across = lastFilledArea(calls);
    expect(across).toBeGreaterThan(along * 4);
  });
});

describe('stroke polylines (region repaint index)', () => {
  function bruteRuns(line: Polyline, r: Rect, pad: number): [number, number][] {
    const out: [number, number][] = [];
    let start = -1;
    for (let i = 0; i < line.xs.length - 1; i++) {
      const hit =
        Math.min(line.xs[i], line.xs[i + 1]) <= r.x + r.w + pad &&
        Math.max(line.xs[i], line.xs[i + 1]) >= r.x - pad &&
        Math.min(line.ys[i], line.ys[i + 1]) <= r.y + r.h + pad &&
        Math.max(line.ys[i], line.ys[i + 1]) >= r.y - pad;
      if (hit && start < 0) start = i;
      if (!hit && start >= 0) {
        out.push([start, i]);
        start = -1;
      }
    }
    if (start >= 0) out.push([start, line.xs.length - 1]);
    return out;
  }

  it('keeps cumulative length and unit normals, and skips tiny steps', () => {
    const b = new PolylineBuilder(1);
    b.start(0, 0);
    expect(b.add(0.5, 0)).toBe(false);
    expect(b.add(3, 4)).toBe(true);
    expect(b.add(6, 8)).toBe(true);
    const [line] = b.lines;
    expect(line.ds).toEqual([0, 5, 10]);
    for (let i = 0; i < line.xs.length; i++) {
      expect(Math.hypot(line.nx[i], line.ny[i])).toBeCloseTo(1, 9);
      // Perpendicular to the direction (0.6, 0.8).
      expect(line.nx[i] * 0.6 + line.ny[i] * 0.8).toBeCloseTo(0, 9);
    }
  });

  it('finds exactly the runs touching a rect, also on very long strokes', () => {
    const b = new PolylineBuilder(0.75);
    b.start(500, 500);
    for (let i = 1; i < 5000; i++) {
      const t = i / 5000;
      b.add(500 + Math.cos(t * 60) * 450 * t, 500 + Math.sin(t * 60) * 450 * t);
    }
    const [line] = b.lines;
    const pad = 12;
    for (const r of [
      { x: 480, y: 480, w: 40, h: 40 },
      { x: 900, y: 450, w: 60, h: 100 },
      { x: 0, y: 0, w: 30, h: 30 },
      { x: 100, y: 500, w: 800, h: 3 },
    ]) {
      const got = runsInRect(b.lines, r, pad).map((run) => [run.i0, run.i1]);
      expect(got).toEqual(bruteRuns(line, r, pad));
    }
  });
});

describe('marker', () => {
  it('is translucent and repaints whole regions', () => {
    const { ctx } = mockContext();
    const s = beginBrushStroke('marker', ctx, 50, 50, 30, [255, 255, 0]);
    expect(s.layerAlpha).toBeGreaterThanOrEqual(0.5);
    expect(s.layerAlpha).toBeLessThanOrEqual(0.6);
    expect(contains(s.initialDirty, 35, 35) && contains(s.initialDirty, 65, 65)).toBe(true);
    const r = s.lineTo(150, 80);
    expect(isIntRect(r)).toBe(true);
    expect(contains(r, 35, 35) && contains(r, 165, 95)).toBe(true);
    expect(s.lineTo(150.2, 80.1)).toBeNull(); // negligible movement
    expect(s.hold()).toBeNull();
  });
});
