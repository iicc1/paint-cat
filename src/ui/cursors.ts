/**
 * paint.cat mouse cursors.
 *
 * Original 32×32 SVG drawings with a black outline and white fill so they stay
 * visible on any color, in the spirit of classic Windows cursors. Each one is
 * exposed as a ready-to-use CSS `cursor` value with hotspot and fallback.
 */

export type CursorName =
  | 'pencil'
  | 'fill'
  | 'picker'
  | 'magnifier'
  | 'airbrush'
  | 'brushCross'
  | 'shapeCross'
  | 'selectCross'
  | 'move'
  | 'resizeNS'
  | 'resizeEW'
  | 'resizeNWSE'
  | 'resizeNESW';

interface CursorDef {
  /** Inner SVG markup for a 32×32 viewBox. */
  readonly body: string;
  /** Hotspot, 0..31. */
  readonly x: number;
  readonly y: number;
  /** Keyword used when the image cannot be loaded. */
  readonly fallback: string;
}

const W = '#fff';
const K = '#000';
const OUT = `fill="${W}" stroke="${K}" stroke-linejoin="round"`;

const f = (v: number): string => String(Math.round(v * 100) / 100);

function poly(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join('') + 'Z';
}

/** Two-headed arrow centered on pixel (15,15), vertical before rotation. */
function doubleArrow(deg: number): string {
  const diagonal = deg % 90 !== 0;
  const c = 15.5;
  const R = diagonal ? 13 : 12;
  const L = 5;
  const h = diagonal ? 5.5 : 5;
  const a = diagonal ? 2.6 : 2;
  const d = poly([
    [c, c - R],
    [c + h, c - R + L],
    [c + a, c - R + L],
    [c + a, c + R - L],
    [c + h, c + R - L],
    [c, c + R],
    [c - h, c + R - L],
    [c - a, c + R - L],
    [c - a, c - R + L],
    [c - h, c - R + L],
  ]);
  // Diagonal variants are rotated; render them aliased so the outline stays solid black.
  let tr = deg === 0 ? '' : ` transform="rotate(${deg} ${c} ${c})"`;
  if (diagonal) tr += ' shape-rendering="crispEdges" stroke-width="1.1"';
  return `<path d="${d}" fill="${W}" stroke="${K}" stroke-linejoin="miter"${tr}/>`;
}

function moveArrows(): string {
  const c = 15.5;
  const R = 13;
  const L = 5;
  const h = 4.5;
  const a = 2;
  const p: Array<[number, number]> = [];
  // One arm (pointing up), then rotate the point set around the center four times.
  const arm: Array<[number, number]> = [
    [c - a, c - a],
    [c - a, c - R + L],
    [c - h, c - R + L],
    [c, c - R],
    [c + h, c - R + L],
    [c + a, c - R + L],
  ];
  for (let k = 0; k < 4; k++) {
    for (const [x, y] of arm) {
      const dx = x - c;
      const dy = y - c;
      // rotate 90° clockwise k times: (dx, dy) -> (-dy, dx)
      let rx = dx;
      let ry = dy;
      for (let i = 0; i < k; i++) [rx, ry] = [-ry, rx];
      p.push([c + rx, c + ry]);
    }
  }
  return `<path d="${poly(p)}" fill="${W}" stroke="${K}" stroke-linejoin="miter"/>`;
}

/** Thin cross with a gap in the middle; `dashed` gives the dotted selection look. */
function thinCross(dashed: boolean): string {
  const arms = 'M15.5 2V12M15.5 19V29M2 15.5H12M19 15.5H29';
  if (dashed) {
    return (
      `<path d="${arms}" stroke="${W}" stroke-width="1"/>` +
      `<path d="${arms}" stroke="${K}" stroke-width="1" stroke-dasharray="1 1"/>` +
      `<rect x="15" y="15" width="1" height="1" fill="${K}"/>`
    );
  }
  return (
    `<path d="${arms}" stroke="${W}" stroke-width="3" stroke-linecap="square"/>` +
    `<rect x="14" y="14" width="3" height="3" fill="${W}"/>` +
    `<path d="${arms}" stroke="${K}" stroke-width="1"/>` +
    `<rect x="15" y="15" width="1" height="1" fill="${K}"/>`
  );
}

const DEFS: Record<CursorName, CursorDef> = {
  pencil: {
    body:
      `<g transform="translate(2 29) rotate(-45)">` +
      `<path d="M0 0L7.5-3.5H21.5V3.5H7.5Z" ${OUT} stroke-width="1.2"/>` +
      `<path d="M0 0L3-1.4V1.4Z" fill="${K}"/>` +
      `<path d="M7.5-3.5V3.5M7.5 0H21.5" stroke="${K}" stroke-width="1"/>` +
      `<rect x="21.5" y="-3.5" width="5" height="7" rx="1" ${OUT} stroke-width="1.2"/>` +
      `</g>`,
    x: 2,
    y: 29,
    fallback: 'crosshair',
  },
  fill: {
    body:
      `<g transform="rotate(-40 16 16)">` +
      `<path d="M9 10C9 2.5 23 2.5 23 10" fill="none" stroke="${W}" stroke-width="3.4"/>` +
      `<path d="M9 10C9 2.5 23 2.5 23 10" fill="none" stroke="${K}" stroke-width="1.4"/>` +
      `<path d="M8 10H24L22 27H10Z" ${OUT} stroke-width="1.3"/>` +
      `<ellipse cx="16" cy="10" rx="8" ry="2.6" fill="${K}"/>` +
      `</g>` +
      `<path d="M4.5 17.5C3.6 21 1.5 23.2 1.5 25.6A3 3 0 0 0 7.5 25.6C7.5 23.2 5.4 21 4.5 17.5Z" fill="${K}" stroke="${W}" stroke-width="1"/>`,
    x: 4,
    y: 28,
    fallback: 'crosshair',
  },
  picker: {
    body:
      `<g transform="translate(2 29) rotate(-45)">` +
      `<path d="M0 0L7-1.6V1.6Z" ${OUT} stroke-width="1.1"/>` +
      `<rect x="7" y="-2.4" width="9" height="4.8" ${OUT} stroke-width="1.2"/>` +
      `<rect x="16" y="-3.8" width="2.6" height="7.6" fill="${K}" stroke="${W}" stroke-width=".8"/>` +
      `<rect x="18.6" y="-3.4" width="8" height="6.8" rx="3.4" fill="${K}" stroke="${W}" stroke-width=".8"/>` +
      `</g>`,
    x: 2,
    y: 29,
    fallback: 'crosshair',
  },
  magnifier: {
    body:
      `<path d="M18.5 18.5L28 28" stroke="${W}" stroke-width="7" stroke-linecap="round"/>` +
      `<path d="M18.5 18.5L28 28" stroke="${K}" stroke-width="4.4" stroke-linecap="round"/>` +
      `<circle cx="12" cy="12" r="8.5" fill="${W}" fill-opacity=".3" stroke="${W}" stroke-width="4"/>` +
      `<circle cx="12" cy="12" r="8.5" fill="none" stroke="${K}" stroke-width="2"/>` +
      `<path d="M7 10.5A5 5 0 0 1 10.5 7" fill="none" stroke="${K}" stroke-width="1" stroke-linecap="round"/>`,
    x: 12,
    y: 12,
    fallback: 'zoom-in',
  },
  airbrush: {
    body:
      `<path d="M12.5 15C12.5 13 13.5 12.5 15 12.5H20C21.5 12.5 22.5 13 22.5 15V29.5H12.5Z" ${OUT}/>` +
      `<path d="M12.5 17.5H22.5M12.5 26.5H22.5" stroke="${K}"/>` +
      `<rect x="15.5" y="8.5" width="4" height="4" ${OUT}/>` +
      `<rect x="10.5" y="9" width="5" height="2.5" fill="${K}" stroke="${W}" stroke-width=".8"/>` +
      `<g fill="${K}" stroke="${W}" stroke-width=".6">` +
      `<circle cx="7.5" cy="8" r=".9"/><circle cx="6" cy="11.5" r=".9"/><circle cx="4" cy="8.5" r=".9"/>` +
      `<circle cx="5" cy="5" r=".9"/><circle cx="8" cy="14" r=".9"/><circle cx="2.5" cy="12" r=".9"/></g>`,
    x: 10,
    y: 10,
    fallback: 'crosshair',
  },
  brushCross: {
    body: `<path d="M13.5 4.5H17.5V13.5H26.5V17.5H17.5V26.5H13.5V17.5H4.5V13.5H13.5Z" fill="${W}" stroke="${K}"/>`,
    x: 15,
    y: 15,
    fallback: 'crosshair',
  },
  shapeCross: { body: thinCross(false), x: 15, y: 15, fallback: 'crosshair' },
  selectCross: { body: thinCross(true), x: 15, y: 15, fallback: 'crosshair' },
  move: { body: moveArrows(), x: 15, y: 15, fallback: 'move' },
  resizeNS: { body: doubleArrow(0), x: 15, y: 15, fallback: 'ns-resize' },
  resizeEW: { body: doubleArrow(90), x: 15, y: 15, fallback: 'ew-resize' },
  resizeNWSE: { body: doubleArrow(-45), x: 15, y: 15, fallback: 'nwse-resize' },
  resizeNESW: { body: doubleArrow(45), x: 15, y: 15, fallback: 'nesw-resize' },
};

/** Full SVG document of a cursor (exported for previews/tests). */
export function cursorSvg(name: CursorName): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">${DEFS[name].body}</svg>`;
}

const cache = new Map<CursorName, string>();

/** CSS `cursor` value: `url("data:image/svg+xml,…") <hotX> <hotY>, <fallback>` */
export function cursorCss(name: CursorName): string {
  let v = cache.get(name);
  if (v === undefined) {
    const d = DEFS[name];
    v = `url("data:image/svg+xml,${encodeURIComponent(cursorSvg(name))}") ${d.x} ${d.y}, ${d.fallback}`;
    cache.set(name, v);
  }
  return v;
}
