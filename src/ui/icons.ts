/**
 * paint.cat icon set.
 *
 * Every drawing in this file is an original, simplified design made for
 * paint.cat using generic metaphors (floppy disk, folder, scissors, bucket…)
 * in a flat Windows-10-like color language. Nothing here is copied or traced
 * from Microsoft artwork.
 *
 * Each icon has a 16×16 drawing (`s`) and/or a more detailed 32×32 drawing
 * (`l`). `icon(name, 32)` uses the 32 drawing when there is one and otherwise
 * scales the 16 drawing up; `icon(name, 16)` does the opposite.
 */

export const ICON_NAMES = [
  // Title bar / quick access toolbar
  'app',
  'save',
  'undo',
  'redo',
  'new',
  'open',
  'print',
  'printPreview',
  'email',
  // File menu
  'saveAs',
  'scanner',
  'wallpaper',
  'properties',
  'about',
  'exit',
  'pageSetup',
  'formatPng',
  'formatJpg',
  'formatBmp',
  'formatGif',
  'formatOther',
  // Home tab
  'paste',
  'pasteFrom',
  'cut',
  'copy',
  'selectRect',
  'selectFree',
  'selectAll',
  'invertSelection',
  'deleteSelection',
  'crop',
  'resize',
  'rotate',
  'rotateRight',
  'rotateLeft',
  'rotate180',
  'flipVertical',
  'flipHorizontal',
  'invertColor',
  'pencil',
  'fill',
  'text',
  'eraser',
  'colorPicker',
  'magnifier',
  // Brushes
  'brushBrush',
  'brushCalligraphy1',
  'brushCalligraphy2',
  'brushAirbrush',
  'brushOil',
  'brushCrayon',
  'brushMarker',
  'brushNaturalPencil',
  'brushWatercolor',
  // Shape outline / fill
  'outline',
  'fillStyle',
  'styleNone',
  'styleSolid',
  'styleCrayon',
  'styleMarker',
  'styleOil',
  'styleNaturalPencil',
  'styleWatercolor',
  'sizeLines',
  'editColors',
  // View tab
  'zoomIn',
  'zoomOut',
  'zoom100',
  'fullscreen',
  'thumbnail',
  // Text tab
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'opaque',
  'transparent',
  // Print preview tab
  'onePage',
  'twoPages',
  'prevPage',
  'nextPage',
  'closePreview',
  // Misc
  'help',
  'language',
  'chevronUp',
  'chevronDown',
  'dropdown',
  'submenu',
  'check',
  'statusCursor',
  'statusSelection',
  'statusImage',
  'zoomMinusCircle',
  'zoomPlusCircle',
] as const;

export type IconName = (typeof ICON_NAMES)[number];

/** `s`: body for a 16×16 viewBox, `l`: body for a 32×32 viewBox. */
interface IconDef {
  readonly s?: string;
  readonly l?: string;
}

// ---------------------------------------------------------------------------
// Palette
// ---------------------------------------------------------------------------

const C = {
  ink: '#22344F',
  blueD: '#2B579A',
  blue: '#3C8FD6',
  blueL: '#9FCBF2',
  blueP: '#E3EFFA',
  navy: '#1F3864',
  grayD: '#5B6470',
  gray: '#8B939D',
  grayL: '#C8CED5',
  grayP: '#EDF0F3',
  purple: '#8061B8',
  purpleD: '#4C3189',
  purpleL: '#DDD4EF',
  purpleM: '#B7A5DB',
  yellow: '#F8CF55',
  yellowM: '#E9AD33',
  yellowD: '#B57B10',
  orange: '#EE6A2C',
  orangeD: '#B9461B',
  orangeL: '#F7A47C',
  brown: '#A8642E',
  brownD: '#6C3D16',
  red: '#D8382F',
  redD: '#A42820',
  green: '#4DAA50',
  greenD: '#2F7D32',
  pink: '#F28DB8',
  pinkD: '#BF5A88',
  pinkL: '#F9C6DC',
  sky: '#8EC6F0',
  wood: '#F3D3A0',
  glass: '#EAF4FD',
  rim: '#4A5563',
} as const;

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Formats a number with at most two decimals. */
const f = (v: number): string => String(Math.round(v * 100) / 100);

/** Closed polygon path data. */
function poly(points: ReadonlyArray<readonly [number, number]>): string {
  return points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${f(x)} ${f(y)}`).join('') + 'Z';
}

/** Deterministic pseudo random generator (for speckle textures). */
function rng(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

type Pt = readonly [number, number];
type Bez = readonly [Pt, Pt, Pt, Pt];

function bezAt(b: Bez, t: number): Pt {
  const u = 1 - t;
  const a = u * u * u;
  const c1 = 3 * u * u * t;
  const c2 = 3 * u * t * t;
  const d = t * t * t;
  return [
    a * b[0][0] + c1 * b[1][0] + c2 * b[2][0] + d * b[3][0],
    a * b[0][1] + c1 * b[1][1] + c2 * b[2][1] + d * b[3][1],
  ];
}

function bezPath(b: Bez, dx = 0, dy = 0): string {
  const p = (q: Pt): string => `${f(q[0] + dx)} ${f(q[1] + dy)}`;
  return `M${p(b[0])}C${p(b[1])} ${p(b[2])} ${p(b[3])}`;
}

/** Page with a folded top-right corner. Coordinates should sit on half pixels. */
function page(x0: number, y0: number, x1: number, y1: number, fold: number, stroke: string = C.gray): string {
  return (
    `<path d="M${x0} ${y0}H${x1 - fold}L${x1} ${y0 + fold}V${y1}H${x0}Z" fill="#fff" stroke="${stroke}"/>` +
    `<path d="M${x1 - fold} ${y0}V${y0 + fold}H${x1}" fill="${C.grayP}" stroke="${stroke}" stroke-linejoin="round"/>`
  );
}

/** A column of text lines (filled rects). */
function lines(x: number, y: number, w: number, count: number, gap: number, h = 1, color: string = C.blueL): string {
  let out = '';
  for (let i = 0; i < count; i++)
    out += `<rect x="${x}" y="${y + i * gap}" width="${w}" height="${h}" fill="${color}"/>`;
  return out;
}

/** Magnifying glass: lens center, radius, rim width, handle length and width. */
function mag(cx: number, cy: number, r: number, rimW: number, len: number, handleW: number): string {
  const a = cx + r * Math.SQRT1_2;
  const b = cy + r * Math.SQRT1_2;
  return (
    `<path d="M${f(a)} ${f(b)}L${f(a + len)} ${f(b + len)}" stroke="${C.grayD}" stroke-width="${handleW}" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.glass}" stroke="${C.rim}" stroke-width="${rimW}"/>`
  );
}

/** Pencil drawn along +x with its tip at the origin (use inside a rotated group). */
function pencilLocal(len: number, w: number, sw: number): string {
  const h = w / 2;
  const t = w * 1.15;
  const e = w * 0.7;
  const m = w * 0.32;
  const b = len - t - e - m;
  return (
    `<path d="M0 0L${f(t)} ${f(-h)}V${f(h)}Z" fill="${C.wood}" stroke="${C.yellowD}" stroke-width="${sw}" stroke-linejoin="round"/>` +
    `<path d="M0 0L${f(t * 0.4)} ${f(-h * 0.4)}V${f(h * 0.4)}Z" fill="${C.ink}"/>` +
    `<rect x="${f(t)}" y="${f(-h)}" width="${f(b)}" height="${f(w)}" fill="${C.yellow}" stroke="${C.yellowD}" stroke-width="${sw}"/>` +
    `<rect x="${f(t)}" y="${f(-h / 3)}" width="${f(b)}" height="${f(w / 3)}" fill="#FBE08F"/>` +
    `<rect x="${f(t + b)}" y="${f(-h)}" width="${f(m)}" height="${f(w)}" fill="${C.grayL}" stroke="${C.grayD}" stroke-width="${sw}"/>` +
    `<rect x="${f(t + b + m)}" y="${f(-h)}" width="${f(e)}" height="${f(w)}" rx="${f(sw)}" fill="${C.pink}" stroke="${C.pinkD}" stroke-width="${sw}"/>`
  );
}

/** Group transform that puts a local +x drawing at (x, y) pointing up-right at `deg`. */
const at = (x: number, y: number, deg = -45): string => `transform="translate(${x} ${y}) rotate(${deg})"`;

// ---------------------------------------------------------------------------
// Shared motifs
// ---------------------------------------------------------------------------

const FLOPPY16 =
  `<path d="M1.5 1.5H12.5L14.5 3.5V14.5H1.5Z" fill="${C.purple}" stroke="${C.purpleD}"/>` +
  `<rect x="4" y="2" width="7" height="4" fill="${C.purpleL}"/>` +
  `<rect x="8" y="3" width="2" height="2" fill="${C.purpleD}"/>` +
  `<rect x="3.5" y="8.5" width="9" height="6" fill="#fff" stroke="${C.purpleD}"/>` +
  lines(5, 10, 6, 2, 2, 1, C.purpleM);

const FLOPPY32 =
  `<path d="M3.5 3.5H24.5L28.5 7.5V28.5H3.5Z" fill="${C.purple}" stroke="${C.purpleD}"/>` +
  `<path d="M4 4H24.3L28 7.7V9H4Z" fill="#9479C7"/>` +
  `<rect x="8" y="4" width="15" height="9" fill="${C.purpleL}"/>` +
  `<rect x="18" y="6" width="3" height="5" fill="${C.purpleD}"/>` +
  `<rect x="7.5" y="16.5" width="17" height="12" fill="#fff" stroke="${C.purpleD}"/>` +
  lines(10, 19, 12, 3, 3, 1.5, C.purpleM);

const FOLDER16 =
  `<path d="M1.5 13.5V2.5H6L7.5 4H13.5V13.5Z" fill="${C.yellowM}" stroke="${C.yellowD}" stroke-linejoin="round"/>` +
  `<rect x="3.5" y="5.5" width="8" height="5" fill="#fff" stroke="${C.gray}"/>` +
  `<path d="M1.5 13.5L3.5 7.5H15.5L13.5 13.5Z" fill="${C.yellow}" stroke="${C.yellowD}" stroke-linejoin="round"/>`;

const FOLDER32 =
  `<path d="M2.5 27.5V5.5H11L14 8.5H26.5V27.5Z" fill="${C.yellowM}" stroke="${C.yellowD}" stroke-linejoin="round"/>` +
  `<rect x="6.5" y="10.5" width="17" height="10" fill="#fff" stroke="${C.gray}"/>` +
  lines(9, 13, 12, 2, 3, 1.5) +
  `<path d="M2.5 27.5L7 15.5H30.5L26.5 27.5Z" fill="${C.yellow}" stroke="${C.yellowD}" stroke-linejoin="round"/>` +
  `<path d="M7.7 16.5H29" stroke="#FCE3A0"/>`;

const PRINTER16 =
  `<rect x="4.5" y="1.5" width="7" height="5" fill="#fff" stroke="${C.gray}"/>` +
  `<rect x="1.5" y="5.5" width="13" height="7" rx="1" fill="#B9C2CC" stroke="${C.grayD}"/>` +
  `<rect x="2" y="6" width="12" height="2" fill="#D9DFE5"/>` +
  `<rect x="12" y="9" width="1" height="1" fill="#39B54A"/>` +
  `<rect x="4.5" y="10.5" width="7" height="4" fill="#fff" stroke="${C.gray}"/>` +
  `<rect x="6" y="12" width="4" height="1" fill="${C.blueL}"/>`;

function printer32(paperIn: string, out: string): string {
  return (
    paperIn +
    `<rect x="2.5" y="11.5" width="27" height="13" rx="2" fill="#B9C2CC" stroke="${C.grayD}"/>` +
    `<path d="M3 13.5A1.5 1.5 0 0 1 4.5 12H27.5A1.5 1.5 0 0 1 29 13.5V16H3Z" fill="#DCE1E7"/>` +
    `<rect x="24" y="18" width="3" height="2" fill="#39B54A"/>` +
    `<rect x="6" y="20" width="20" height="2" fill="${C.grayD}"/>` +
    out
  );
}

const PRINTER32 = printer32(
  `<rect x="8.5" y="2.5" width="15" height="11" fill="#fff" stroke="${C.gray}"/>` + lines(11, 5, 10, 2, 3, 1.5),
  `<rect x="7.5" y="21.5" width="17" height="8" fill="#fff" stroke="${C.gray}"/>` + lines(10, 24, 12, 2, 3, 1.5),
);

const TRI_SOLID = `fill="${C.blue}" stroke="${C.blueD}" stroke-linejoin="round"`;
const TRI_GHOST = `fill="${C.blueP}" stroke="${C.blue}" stroke-linejoin="round"`;

/** Triangle with a quarter-turn clockwise arrow (16 grid). */
const ROTATE_RIGHT16 =
  `<path d="M2.5 14.5V7.5L9.5 14.5Z" ${TRI_SOLID}/>` +
  `<path d="M7 2.5A6 6 0 0 1 13 8.5" fill="none" stroke="${C.blueD}" stroke-width="1.4"/>` +
  `<path d="M10.8 7.5H15.2L13 10.8Z" fill="${C.blueD}"/>`;

/** Small floppy for composite 16 px icons (occupies 1..13). */
const FLOPPY_SMALL16 =
  `<path d="M1.5 1.5H10L12.5 4V12.5H1.5Z" fill="${C.purple}" stroke="${C.purpleD}"/>` +
  `<rect x="4" y="2" width="5" height="3" fill="${C.purpleL}"/>` +
  `<rect x="7" y="2" width="1" height="2" fill="${C.purpleD}"/>` +
  `<rect x="3.5" y="7.5" width="7" height="5" fill="#fff" stroke="${C.purpleD}"/>` +
  `<rect x="5" y="9" width="4" height="1" fill="${C.purpleM}"/>`;

/** Serif capital A for a 16 grid (fill-rule evenodd for the counter). */
const SERIF_A =
  'M6.8 2H9.2L12.6 12.5H14V14H9.4V12.5H10.03L9.32 10.3H5.47L4.73 12.5H5.9V14H2V12.5H3.3ZM5.9 9H8.9L7.42 4.43Z';

/** Paint bucket tipped towards the upper left, pouring `paint` from its lip (16 grid). */
function bucket16(paint: string, paintD: string): string {
  return (
    `<g transform="rotate(-45 9 8)">` +
    `<path d="M4 5H12L11 14H5Z" fill="${C.grayP}" stroke="${C.grayD}" stroke-linejoin="round"/>` +
    `<path d="M5 9.5H11.5" stroke="${C.grayL}"/>` +
    `<ellipse cx="8" cy="5" rx="4" ry="1.6" fill="#fff" stroke="${C.grayD}"/>` +
    `<ellipse cx="8" cy="5.3" rx="2.8" ry=".9" fill="${paint}"/>` +
    `</g>` +
    `<path d="M3.6 9.2C3 10.8 1.5 12 1.5 13.2A1.7 1.7 0 0 0 4.9 13.2C4.9 12 3.9 10.8 3.6 9.2Z" fill="${paint}" stroke="${paintD}" stroke-width=".7"/>`
  );
}

/** Clipboard (board + clip) in 16 grid. */
const CLIPBOARD16 =
  `<rect x="1.5" y="2.5" width="10" height="12" rx="1" fill="#C9A46A" stroke="#7E5E30"/>` +
  `<rect x="4.5" y="1.5" width="4" height="3" rx=".5" fill="${C.grayL}" stroke="${C.grayD}"/>`;

// --- brushes -----------------------------------------------------------------

/** Sample stroke used in every brush icon (32 grid); it ends where the tool tip is. */
const BS: Bez = [
  [3, 15],
  [3, 27],
  [10, 29],
  [13.5, 19.5],
];
const TIP: Pt = [13.5, 19.5];
const tool = (inner: string): string => `<g ${at(TIP[0], TIP[1])}>${inner}</g>`;

const SAMPLE = '#E8552A';

function roundBrush(tip: string, handle: string, handleD: string): string {
  return tool(
    `<path d="M0 0C1.5-2 4-3 7.5-3V3C4 3 1.5 2 0 0Z" fill="${tip}" stroke="${C.orangeD}" stroke-width=".8" stroke-linejoin="round"/>` +
      `<rect x="7.5" y="-3.2" width="5" height="6.4" fill="${C.grayL}" stroke="${C.grayD}" stroke-width=".8"/>` +
      `<path d="M12.5-2.6L22-1.8C24-1.6 24 1.6 22 1.8L12.5 2.6Z" fill="${handle}" stroke="${handleD}" stroke-width=".8" stroke-linejoin="round"/>`,
  );
}

function calliPen(body: string, bodyD: string): string {
  return tool(
    `<path d="M0 0L4.5-2.8H8.5V2.8H4.5Z" fill="#A9B2BC" stroke="${C.grayD}" stroke-width=".8" stroke-linejoin="round"/>` +
      `<path d="M.8 0H5" stroke="${C.grayD}" stroke-width=".7"/><circle cx="5.6" cy="0" r=".8" fill="${C.grayD}"/>` +
      `<rect x="8.5" y="-3" width="2.5" height="6" fill="#E3B94B" stroke="#9A7417" stroke-width=".8"/>` +
      `<path d="M11-3H22C23.2-3 23.2 3 22 3H11Z" fill="${body}" stroke="${bodyD}" stroke-width=".8"/>`,
  );
}

/** Calligraphy ribbon: the stroke curve swept by a flat nib of vector (vx, vy). */
function ribbon(vx: number, vy: number): string {
  const [p0, c1, c2, p3] = BS;
  const s = (q: Pt, k: number): string => `${f(q[0] + vx * k)} ${f(q[1] + vy * k)}`;
  return `<path d="M${s(p0, -1)}C${s(c1, -1)} ${s(c2, -1)} ${s(p3, -1)}L${s(p3, 1)}C${s(c2, 1)} ${s(c1, 1)} ${s(p0, 1)}Z" fill="${SAMPLE}" stroke="${SAMPLE}" stroke-width=".6" stroke-linejoin="round"/>`;
}

function sprayDots(): string {
  const r = rng(7);
  let out = '';
  for (let i = 0; i <= 26; i++) {
    const [x, y] = bezAt(BS, i / 26);
    for (let k = 0; k < 4; k++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 3.4;
      out += `<rect x="${f(x + Math.cos(a) * d - 0.45)}" y="${f(y + Math.sin(a) * d - 0.45)}" width=".9" height=".9" fill="${SAMPLE}"/>`;
    }
  }
  return out;
}

function speckles(seed: number, count: number, spread: number, size: number, color: string): string {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const [x, y] = bezAt(BS, r());
    out += `<rect x="${f(x + (r() - 0.5) * spread - size / 2)}" y="${f(y + (r() - 0.5) * spread - size / 2)}" width="${size}" height="${size}" fill="${color}"/>`;
  }
  return out;
}

const strokeOf = (w: number, color: string, opacity = 1, cap = 'round'): string =>
  `<path d="${bezPath(BS)}" fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="${cap}"${opacity < 1 ? ` stroke-opacity="${opacity}"` : ''}/>`;

// --- swatches (16) ------------------------------------------------------------

const SWATCH_FRAME = `<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="${C.gray}"/>`;

function swatchSpeckle(): string {
  const r = rng(3);
  let out = `<rect x="2" y="2" width="12" height="12" fill="${C.orange}"/>`;
  for (let i = 0; i < 26; i++) {
    out += `<rect x="${2 + Math.floor(r() * 12)}" y="${2 + Math.floor(r() * 12)}" width="1" height="1" fill="#FBD2BC"/>`;
  }
  return SWATCH_FRAME + out;
}

// --- checkerboard -------------------------------------------------------------

function checker(x0: number, y0: number, cells: number, cell: number, color: string): string {
  let out = '';
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      if ((i + j) % 2 === 0)
        out += `<rect x="${x0 + i * cell}" y="${y0 + j * cell}" width="${cell}" height="${cell}" fill="${color}"/>`;
    }
  }
  return out;
}

// --- format thumbnails (32) -----------------------------------------------------

const PHOTO_FRAME = `<rect x="2.5" y="4.5" width="27" height="23" fill="#fff" stroke="${C.grayD}"/>`;

// ---------------------------------------------------------------------------
// Icon definitions
// ---------------------------------------------------------------------------

const DEFS: Record<IconName, IconDef> = {
  // ---- Title bar / QAT -----------------------------------------------------
  app: {
    s:
      `<path d="M7.5 1.5C11.6 1.5 14.5 4 14.5 6.8C14.5 8.6 13.3 9.3 12 9.1C10.6 8.9 9.7 9.6 10 10.9C10.3 12.4 9.6 14.5 7 14.5C3.7 14.5 1.5 11.6 1.5 8C1.5 4.4 4.2 1.5 7.5 1.5Z" fill="#F4E2BE" stroke="#A47A44"/>` +
      `<circle cx="4.6" cy="6.3" r="1.3" fill="${C.red}"/><circle cx="7.7" cy="4.3" r="1.3" fill="#F2B705"/>` +
      `<circle cx="11" cy="5.4" r="1.3" fill="${C.blue}"/><circle cx="4.7" cy="10.2" r="1.3" fill="${C.green}"/>` +
      `<path d="M15 15L12.2 12.2" stroke="${C.brown}" stroke-width="2.2" stroke-linecap="round"/>` +
      `<path d="M12.4 12.4L10.8 10.8" stroke="${C.grayD}" stroke-width="2.4"/>` +
      `<path d="M11.5 9.9L9.9 11.5L7.2 7.2Z" fill="${C.orange}" stroke="${C.orangeD}" stroke-width=".6" stroke-linejoin="round"/>`,
    l:
      `<path d="M15 3C23.5 3 29 8 29 13.6C29 17.4 26.6 18.7 24 18.3C21.3 17.9 19.4 19.3 20 22C20.6 25 19.2 29 14 29C7.4 29 3 23.2 3 16C3 8.8 8.4 3 15 3Z" fill="#F4E2BE" stroke="#A47A44" stroke-width="1.2"/>` +
      `<circle cx="9.2" cy="12.4" r="2.6" fill="${C.red}"/><circle cx="15.4" cy="8.4" r="2.6" fill="#F2B705"/>` +
      `<circle cx="22" cy="10.6" r="2.6" fill="${C.blue}"/><circle cx="9.4" cy="20.4" r="2.6" fill="${C.green}"/>` +
      `<path d="M30 30L24.5 24.5" stroke="${C.brown}" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M24.8 24.8L21.6 21.6" stroke="${C.grayD}" stroke-width="4.6"/>` +
      `<path d="M23.2 19.8L19.8 23.2L14.4 14.4Z" fill="${C.orange}" stroke="${C.orangeD}" stroke-linejoin="round"/>`,
  },
  save: { s: FLOPPY16, l: FLOPPY32 },
  undo: {
    s:
      `<path d="M6 5.5H9.5A4.25 4.25 0 0 1 9.5 14H7" fill="none" stroke="${C.blue}" stroke-width="2"/>` +
      `<path d="M1 5.5L6.5 1V10Z" fill="${C.blue}"/>`,
  },
  redo: {
    s:
      `<path d="M10 5.5H6.5A4.25 4.25 0 0 0 6.5 14H9" fill="none" stroke="${C.blue}" stroke-width="2"/>` +
      `<path d="M15 5.5L9.5 1V10Z" fill="${C.blue}"/>`,
  },
  new: {
    s: page(3.5, 1.5, 13.5, 14.5, 4),
    l: page(6.5, 2.5, 26.5, 29.5, 7) + `<path d="M7 27H26V29H7Z" fill="${C.grayP}"/>`,
  },
  open: { s: FOLDER16, l: FOLDER32 },
  print: { s: PRINTER16, l: PRINTER32 },
  printPreview: {
    s: page(2.5, 1.5, 11.5, 14.5, 3) + lines(4, 5, 5, 3, 2) + mag(10, 10, 3, 1, 3, 2),
    l: page(4.5, 2.5, 22.5, 29.5, 6) + lines(7.5, 9, 10, 5, 3, 1.5) + mag(19.5, 19.5, 6, 1.6, 6.5, 3.6),
  },
  email: {
    s:
      `<rect x="1.5" y="3.5" width="13" height="9" fill="#fff" stroke="${C.grayD}"/>` +
      `<path d="M1.5 3.5L8 9L14.5 3.5" fill="${C.grayP}" stroke="${C.grayD}" stroke-linejoin="round"/>`,
    l:
      `<rect x="2.5" y="6.5" width="27" height="19" fill="#fff" stroke="${C.grayD}"/>` +
      `<path d="M3 25L12.5 16.5M29 25L19.5 16.5" stroke="${C.grayL}"/>` +
      `<path d="M2.5 6.5L16 17.5L29.5 6.5" fill="${C.grayP}" stroke="${C.grayD}" stroke-linejoin="round"/>` +
      `<rect x="23" y="18" width="4" height="5" fill="${C.red}"/><rect x="24" y="19" width="2" height="1" fill="#F6B3AE"/>`,
  },

  // ---- File menu -------------------------------------------------------------
  saveAs: {
    s: FLOPPY_SMALL16 + `<g ${at(7.6, 15)}>${pencilLocal(10.5, 3.2, 0.6)}</g>`,
    l: `<g transform="translate(0 -1) scale(.8)">${FLOPPY32}</g><g ${at(14, 30)}>${pencilLocal(22, 5.5, 0.9)}</g>`,
  },
  scanner: {
    s:
      `<path d="M3.5 2.5H12.5L13.5 7.5H2.5Z" fill="${C.grayL}" stroke="${C.grayD}" stroke-linejoin="round"/>` +
      `<path d="M2.5 7.5H13.5L14.5 10.5H1.5Z" fill="${C.sky}" stroke="${C.grayD}" stroke-linejoin="round"/>` +
      `<rect x="1.5" y="10.5" width="13" height="3" fill="#B9C2CC" stroke="${C.grayD}"/>` +
      `<rect x="11" y="11" width="2" height="1" fill="#39B54A"/>`,
    l:
      `<path d="M6.5 3.5H25.5L27.5 13.5H4.5Z" fill="#DCE1E7" stroke="${C.grayD}" stroke-linejoin="round"/>` +
      `<path d="M7.3 5H24.7" stroke="#fff"/>` +
      `<path d="M4.5 13.5H27.5L29.5 19.5H2.5Z" fill="${C.sky}" stroke="${C.grayD}" stroke-linejoin="round"/>` +
      `<path d="M4 17.5H28" stroke="#fff" stroke-width="1.5"/>` +
      `<rect x="2.5" y="19.5" width="27" height="7" rx="1" fill="#B9C2CC" stroke="${C.grayD}"/>` +
      `<rect x="5" y="22" width="12" height="1" fill="${C.grayD}"/>` +
      `<rect x="23" y="22" width="4" height="2" fill="#39B54A"/>` +
      `<rect x="4" y="27" width="3" height="2" fill="${C.grayD}"/><rect x="25" y="27" width="3" height="2" fill="${C.grayD}"/>`,
  },
  wallpaper: {
    s:
      `<rect x="1.5" y="1.5" width="13" height="10" fill="#3B4450" stroke="#262C33"/>` +
      `<rect x="2" y="2" width="12" height="9" fill="${C.sky}"/>` +
      `<circle cx="11" cy="4.5" r="1.3" fill="#FFD54A"/>` +
      `<path d="M2 11V8.5C4 6 6 6.5 8 8C10 6.5 12 7 14 8.5V11Z" fill="${C.green}"/>` +
      `<rect x="6" y="12" width="4" height="1" fill="#7A838E"/><rect x="4" y="13" width="8" height="2" fill="#A3ACB7"/>`,
    l:
      `<rect x="2.5" y="3.5" width="27" height="19" rx="1" fill="#3B4450" stroke="#262C33"/>` +
      `<rect x="4" y="5" width="24" height="16" fill="${C.sky}"/>` +
      `<rect x="4" y="5" width="24" height="5" fill="#B7DCF7"/>` +
      `<circle cx="22.5" cy="9.5" r="2.5" fill="#FFD54A"/>` +
      `<path d="M4 21V16C8 11.5 12 12 16 15.5C19 13 24 12.5 28 16V21Z" fill="${C.green}"/>` +
      `<path d="M4 21V18.5C9 16 15 16.5 20 21Z" fill="${C.greenD}"/>` +
      `<rect x="13" y="23" width="6" height="3" fill="#7A838E"/>` +
      `<rect x="8.5" y="26.5" width="15" height="2" rx="1" fill="#A3ACB7" stroke="${C.grayD}"/>`,
  },
  properties: {
    s: `<path d="M1.5 8.6L3.7 6.5L6.4 9.2L12.4 2.6L14.5 4.6L6.5 13.4Z" fill="#F07C33" stroke="${C.orangeD}" stroke-linejoin="round"/>`,
    l: `<path d="M3.5 17L7.8 12.8L13.3 18.3L25.3 4.6L29.3 8.4L13.6 26.2Z" fill="#F07C33" stroke="${C.orangeD}" stroke-width="1.2" stroke-linejoin="round"/><path d="M5.2 17L7.8 14.5L13.3 20" fill="none" stroke="#F7AB7E"/>`,
  },
  about: {
    s:
      `<circle cx="8" cy="8" r="6.5" fill="#2F6FCB" stroke="#1E4F96"/>` +
      `<circle cx="8" cy="4.8" r="1.1" fill="#fff"/>` +
      `<path d="M6 7H9V11H10V12H6V11H7V8H6Z" fill="#fff"/>`,
    l:
      `<circle cx="16" cy="16" r="13.5" fill="#2F6FCB" stroke="#1E4F96"/>` +
      `<path d="M5.5 13A11 11 0 0 1 26.5 13" fill="none" stroke="#5B93DE" stroke-width="2"/>` +
      `<circle cx="16" cy="9.5" r="2.2" fill="#fff"/>` +
      `<path d="M12.5 13H18V22H20V24H12V22H14V15H12.5Z" fill="#fff"/>`,
  },
  exit: {
    s:
      `<rect x="2.5" y="1.5" width="8" height="13" fill="${C.grayP}" stroke="${C.grayD}"/>` +
      `<path d="M2.5 1.5L6.5 2.5V15.5L2.5 14.5Z" fill="#C8823E" stroke="${C.brownD}" stroke-linejoin="round"/>` +
      `<path d="M7 7H11V4.5L15 8.5L11 12.5V10H7Z" fill="${C.blue}" stroke="${C.blueD}" stroke-linejoin="round"/>`,
    l:
      `<rect x="4.5" y="2.5" width="15" height="27" fill="${C.grayP}" stroke="${C.grayD}"/>` +
      `<path d="M4.5 2.5L12.5 4.5V31L4.5 29.5Z" fill="#C8823E" stroke="${C.brownD}" stroke-linejoin="round"/>` +
      `<circle cx="10.5" cy="17" r="1" fill="#F7D36A"/>` +
      `<path d="M13.5 13.5H21.5V9L29.5 16.5L21.5 24V19.5H13.5Z" fill="${C.blue}" stroke="${C.blueD}" stroke-linejoin="round"/>`,
  },
  pageSetup: {
    s:
      `<rect x="4.5" y="1.5" width="8" height="8" fill="#fff" stroke="${C.gray}"/>` +
      `<path d="M6 5.5L7.8 7.3L11 3.6" fill="none" stroke="${C.blue}" stroke-width="1.4"/>` +
      `<rect x="1.5" y="8.5" width="13" height="5" rx="1" fill="#B9C2CC" stroke="${C.grayD}"/>` +
      `<rect x="4.5" y="11.5" width="7" height="3" fill="#fff" stroke="${C.gray}"/>`,
    l: printer32(
      page(7.5, 1.5, 24.5, 17.5, 4) +
        `<path d="M11 10L14.5 13.5L21.5 5.5" fill="none" stroke="${C.blue}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
      `<rect x="7.5" y="21.5" width="17" height="8" fill="#fff" stroke="${C.gray}"/>`,
    ),
  },
  formatPng: {
    l:
      PHOTO_FRAME +
      `<rect x="4" y="6" width="24" height="20" fill="#CFEAC2"/>` +
      `<path d="M16 17V26" stroke="${C.greenD}" stroke-width="1.6"/>` +
      `<path d="M16 23C13 23 11 21.5 10.5 19.5C13 19.5 15 20.5 16 23Z" fill="${C.green}"/>` +
      [0, 72, 144, 216, 288]
        .map((d) => {
          const a = ((d - 90) * Math.PI) / 180;
          return `<circle cx="${f(16 + Math.cos(a) * 4)}" cy="${f(13 + Math.sin(a) * 4)}" r="3.4" fill="${C.red}" stroke="${C.redD}" stroke-width=".7"/>`;
        })
        .join('') +
      `<circle cx="16" cy="13" r="2.6" fill="#FFC928" stroke="#C98A00" stroke-width=".7"/>`,
  },
  formatJpg: {
    l:
      PHOTO_FRAME +
      `<rect x="4" y="6" width="24" height="20" fill="#7DB6EA"/>` +
      `<rect x="4" y="6" width="24" height="5" fill="#A9D0F2"/>` +
      `<path d="M7 11.5C8 10 10.5 10 11.5 11C12.5 10.2 14.5 10.5 14.5 11.5Z" fill="#fff"/>` +
      `<path d="M4 20L11 12.5L16 17L20 13.5L28 20V26H4Z" fill="#6E8FB5"/>` +
      `<path d="M15 14.5L16 17L17 15.5L16 14Z" fill="#fff"/>` +
      `<path d="M4 26V20.5C10 18 18 18.5 28 22V26Z" fill="#5FA557"/>` +
      `<path d="M4 26V23.5C12 21.5 20 22.5 28 25.5V26Z" fill="#3E8A45"/>`,
  },
  formatBmp: {
    l:
      PHOTO_FRAME +
      `<rect x="4" y="6" width="24" height="20" fill="#F6ECD6"/>` +
      `<path d="M5.5 22C8 14 12 9 18 9.5" fill="none" stroke="${SAMPLE}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<path d="M8.5 24C12 20 16 19.5 20.5 21.5" fill="none" stroke="#2F86C9" stroke-width="2.6" stroke-linecap="round"/>` +
      `<circle cx="11" cy="15" r="2" fill="#F5C518"/>` +
      `<g ${at(20, 16)}>` +
      `<path d="M0 0C1-1.5 3-2.2 5-2.2V2.2C3 2.2 1 1.5 0 0Z" fill="${SAMPLE}"/>` +
      `<rect x="5" y="-2.3" width="3.5" height="4.6" fill="${C.grayL}" stroke="${C.grayD}" stroke-width=".7"/>` +
      `<path d="M8.5-1.8L15-1.2C16.4-1 16.4 1 15 1.2L8.5 1.8Z" fill="${C.brown}" stroke="${C.brownD}" stroke-width=".7"/>` +
      `</g>`,
  },
  formatGif: {
    l:
      PHOTO_FRAME +
      `<rect x="4" y="6" width="24" height="20" fill="#BFE6FA"/>` +
      `<g stroke="#E09A00" stroke-width="1.4" stroke-linecap="round">` +
      `<path d="M10 7.5V9M10 17V18.5M4.5 13H6M14 13H15.5M6.2 9.2L7.2 10.2M12.8 15.8L13.8 16.8M6.2 16.8L7.2 15.8M12.8 10.2L13.8 9.2"/></g>` +
      `<circle cx="10" cy="13" r="3" fill="#FFD43B" stroke="#E09A00"/>` +
      `<path d="M4 26V21C8 15 14 15 18 20C21 16.5 26 16.5 28 19V26Z" fill="#62C44C" stroke="#2D7A22" stroke-linejoin="round"/>` +
      `<path d="M10 26C12 22 16 20.5 21 21.5C24 22 26.5 23.5 28 25V26Z" fill="#3FA83A" stroke="#2D7A22" stroke-linejoin="round"/>`,
  },
  formatOther: {
    l:
      `<rect x="2.5" y="2.5" width="18" height="15" fill="#fff" stroke="${C.grayD}"/>` +
      `<rect x="4" y="4" width="15" height="12" fill="${C.sky}"/>` +
      `<path d="M4 16V12L8.5 8.5L12 11.5L14.5 9.5L19 13.5V16Z" fill="${C.green}"/>` +
      `<g transform="translate(9 9) scale(.7)">${FLOPPY32}</g>`,
  },

  // ---- Home tab ----------------------------------------------------------------
  paste: {
    s:
      CLIPBOARD16 +
      `<rect x="6.5" y="5.5" width="8" height="9" fill="#fff" stroke="${C.gray}"/>` +
      lines(8, 8, 5, 3, 2),
    l:
      `<rect x="3.5" y="4.5" width="19" height="25" rx="2" fill="#C9A46A" stroke="#7E5E30"/>` +
      `<rect x="5" y="6" width="16" height="2" fill="#D8BB8C"/>` +
      `<rect x="9.5" y="2.5" width="7" height="5" rx="1" fill="${C.grayL}" stroke="${C.grayD}"/>` +
      `<rect x="11" y="3.5" width="4" height="1.5" fill="${C.grayD}"/>` +
      page(12.5, 11.5, 28.5, 29.5, 5) +
      lines(15, 18, 11, 4, 3, 1.5),
  },
  pasteFrom: {
    s:
      CLIPBOARD16 +
      `<rect x="4.5" y="5.5" width="5" height="5" fill="#fff" stroke="${C.gray}"/>` +
      `<path d="M7.5 15.5V8.5H10.5L11.5 9.5H14.5V15.5Z" fill="${C.yellowM}" stroke="${C.yellowD}" stroke-linejoin="round"/>` +
      `<path d="M7.5 15.5L8.5 11.5H15.5L14.5 15.5Z" fill="${C.yellow}" stroke="${C.yellowD}" stroke-linejoin="round"/>`,
  },
  cut: {
    s:
      `<path d="M6.6 10.2L11 1.5M9.4 10.2L5 1.5" stroke="${C.gray}" stroke-width="1.6" stroke-linecap="round"/>` +
      `<circle cx="8" cy="7.2" r=".8" fill="${C.grayD}"/>` +
      `<circle cx="5" cy="12.5" r="2.2" fill="none" stroke="#3B4450" stroke-width="1.4"/>` +
      `<circle cx="11" cy="12.5" r="2.2" fill="none" stroke="#3B4450" stroke-width="1.4"/>`,
  },
  copy: {
    s:
      page(1.5, 1.5, 9.5, 11.5, 2) +
      lines(3, 5, 4, 2, 2) +
      page(6.5, 4.5, 14.5, 14.5, 2) +
      lines(8, 8, 5, 3, 2, 1, C.blue),
  },
  selectRect: {
    s: `<rect x="1.5" y="2.5" width="13" height="11" fill="${C.blueP}" stroke="#3D4B5C" stroke-dasharray="2 1"/>`,
    l: `<rect x="2.5" y="5.5" width="27" height="21" fill="${C.blueP}" stroke="#3D4B5C" stroke-dasharray="3 2"/>`,
  },
  selectFree: {
    s: `<path d="M4 2.5C7 1.5 9 3 11 2.5C13.5 2 15 4.5 14 7C13.5 8.5 14.5 10.5 13 12C11 14 8.5 12.5 6.5 13.5C4 14.5 1.5 13 1.8 10.5C2 8.5 1 7 2 5C2.5 3.8 3 3 4 2.5Z" fill="${C.blueP}" stroke="#3D4B5C" stroke-dasharray="2 1"/>`,
    l: `<path d="M8 6.5C13 3.5 18 6.5 22 5.5C27 4.5 30.5 9 28.5 14C27.5 17 29.5 20.5 26.5 24C23 28 17.5 25 13 26.5C8 28.5 3 25.5 3.5 20C4 15.5 2 12 4 9C5 7.6 6.5 7.3 8 6.5Z" fill="${C.blueP}" stroke="#3D4B5C" stroke-dasharray="3 2"/>`,
  },
  selectAll: {
    s:
      `<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#3D4B5C" stroke-dasharray="2 1"/>` +
      `<rect x="4" y="4" width="8" height="8" fill="${C.blue}"/>`,
  },
  invertSelection: {
    s:
      `<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="#3D4B5C" stroke-dasharray="2 1"/>` +
      `<path d="M4 6H10" stroke="${C.blueD}"/><path d="M12 6L9 3.5V8.5Z" fill="${C.blueD}"/>` +
      `<path d="M6 10H12" stroke="${C.blueD}"/><path d="M4 10L7 7.5V12.5Z" fill="${C.blueD}"/>`,
  },
  deleteSelection: {
    s: `<path d="M3.5 3.5L12.5 12.5M12.5 3.5L3.5 12.5" stroke="${C.red}" stroke-width="2.4" stroke-linecap="round"/>`,
  },
  crop: {
    s:
      `<path d="M4 1V12H15" fill="none" stroke="${C.grayD}" stroke-width="2"/>` +
      `<path d="M1 4H12V15" fill="none" stroke="${C.blue}" stroke-width="2"/>` +
      `<path d="M5.5 10.5L13.5 2.5" stroke="${C.gray}"/>`,
  },
  resize: {
    s:
      `<rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="${C.gray}" stroke-dasharray="2 1"/>` +
      `<rect x="1.5" y="1.5" width="7" height="6" fill="${C.blueP}" stroke="${C.blueD}"/>` +
      `<path d="M8 8.5L12 12.5" stroke="${C.blueD}" stroke-width="1.4"/><path d="M13.5 13.5V9L9 13.5Z" fill="${C.blueD}"/>`,
  },
  rotate: { s: ROTATE_RIGHT16 },
  rotateRight: { s: ROTATE_RIGHT16 },
  rotateLeft: {
    s:
      `<path d="M13.5 14.5V7.5L6.5 14.5Z" ${TRI_SOLID}/>` +
      `<path d="M9 2.5A6 6 0 0 0 3 8.5" fill="none" stroke="${C.blueD}" stroke-width="1.4"/>` +
      `<path d="M.8 7.5H5.2L3 10.8Z" fill="${C.blueD}"/>`,
  },
  rotate180: {
    s:
      `<path d="M5.5 14.5V9.5L10.5 14.5Z" ${TRI_SOLID}/>` +
      `<path d="M2.5 8.5A5.5 5.5 0 0 1 13.5 8.5" fill="none" stroke="${C.blueD}" stroke-width="1.4"/>` +
      `<path d="M11.3 8H15.7L13.5 11.3Z" fill="${C.blueD}"/>`,
  },
  flipVertical: {
    s:
      `<path d="M2.5 6.5H13.5L2.5 1.5Z" ${TRI_SOLID}/>` +
      `<path d="M2.5 9.5H13.5L2.5 14.5Z" ${TRI_GHOST}/>` +
      `<path d="M0 8H16" stroke="${C.gray}" stroke-dasharray="1 1"/>`,
  },
  flipHorizontal: {
    s:
      `<path d="M6.5 2.5V13.5H1.5Z" ${TRI_SOLID}/>` +
      `<path d="M9.5 2.5V13.5H14.5Z" ${TRI_GHOST}/>` +
      `<path d="M8 0V16" stroke="${C.gray}" stroke-dasharray="1 1"/>`,
  },
  invertColor: {
    s:
      `<rect x="2.5" y="2.5" width="11" height="11" fill="#fff" stroke="${C.grayD}"/>` +
      `<rect x="3" y="3" width="5" height="10" fill="#1E1E1E"/>`,
  },
  pencil: {
    s: `<g ${at(2.2, 13.8)}>${pencilLocal(16, 4.2, 0.7)}</g>`,
  },
  fill: { s: bucket16(C.blue, C.blueD) },
  text: {
    s: `<path d="${SERIF_A}" fill="${C.ink}" fill-rule="evenodd"/>`,
  },
  eraser: {
    s:
      `<g transform="rotate(-45 8 8)">` +
      `<rect x="1.5" y="5" width="13" height="6" rx="1" fill="${C.pinkL}" stroke="${C.pinkD}"/>` +
      `<path d="M2.5 5.5H7V10.5H2.5Z" fill="${C.pink}"/>` +
      `<path d="M7 5V11" stroke="${C.pinkD}"/>` +
      `</g>` +
      `<path d="M6 14.5H14" stroke="${C.gray}"/>`,
  },
  colorPicker: {
    s:
      `<g transform="rotate(-45 8 8)">` +
      `<path d="M.8 8L5 6.9V9.1Z" fill="${C.blueL}" stroke="${C.blueD}" stroke-width=".7" stroke-linejoin="round"/>` +
      `<rect x="5" y="6.4" width="5.2" height="3.2" fill="${C.blueP}" stroke="${C.grayD}" stroke-width=".8"/>` +
      `<rect x="5.5" y="7.4" width="3" height="1.4" fill="${C.blue}"/>` +
      `<rect x="10.2" y="5.4" width="1.6" height="5.2" fill="${C.grayD}"/>` +
      `<rect x="11.8" y="5.9" width="4" height="4.2" rx="2" fill="#3D4652"/>` +
      `</g>`,
  },
  magnifier: {
    s: mag(6.5, 6.5, 4.5, 1.4, 4.6, 2.4),
  },

  // ---- Brushes (32) ------------------------------------------------------------
  brushBrush: {
    l: strokeOf(3.4, SAMPLE) + roundBrush(SAMPLE, C.brown, C.brownD),
  },
  brushCalligraphy1: {
    l: ribbon(2.2, -2.2) + calliPen('#3B4450', '#1E2630'),
  },
  brushCalligraphy2: {
    l: ribbon(2.2, 2.2) + calliPen('#2F5E9E', '#1B3B6A'),
  },
  brushAirbrush: {
    l:
      sprayDots() +
      tool(
        `<path d="M0 0L5-1.6V1.6Z" fill="${C.grayD}"/>` +
          `<rect x="5" y="-3" width="15" height="6" rx="3" fill="#D5DBE2" stroke="${C.grayD}" stroke-width=".8"/>` +
          `<rect x="9.5" y="-5.2" width="3.4" height="2.4" rx=".6" fill="${C.orange}" stroke="${C.orangeD}" stroke-width=".7"/>` +
          `<rect x="20" y="-1.4" width="4" height="2.8" fill="${C.grayD}"/>`,
      ),
  },
  brushOil: {
    l:
      strokeOf(5.4, SAMPLE) +
      `<path d="${bezPath(BS, -0.9, 0.6)}" fill="none" stroke="#A8361A" stroke-width=".8"/>` +
      `<path d="${bezPath(BS, 1, -0.5)}" fill="none" stroke="#F8A27C" stroke-width=".8"/>` +
      `<path d="${bezPath(BS, 0.2, 0.1)}" fill="none" stroke="#C4441D" stroke-width=".5"/>` +
      tool(
        `<path d="M0-4.2H6.5V4.2H0Z" fill="${SAMPLE}" stroke="${C.orangeD}" stroke-width=".8"/>` +
          `<path d="M1 -3H5.5M1 0H5.5M1 3H5.5" stroke="#B8401A" stroke-width=".6"/>` +
          `<rect x="6.5" y="-4.4" width="5" height="8.8" fill="${C.grayL}" stroke="${C.grayD}" stroke-width=".8"/>` +
          `<path d="M11.5-2.6L21-1.8C23-1.6 23 1.6 21 1.8L11.5 2.6Z" fill="${C.brownD}" stroke="#40220A" stroke-width=".8"/>`,
      ),
  },
  brushCrayon: {
    l:
      strokeOf(4.2, SAMPLE) +
      speckles(11, 70, 4.4, 0.8, '#FFFFFF') +
      tool(
        `<path d="M0 0L2-1.6H5.5V1.6H2Z" fill="${SAMPLE}" stroke="${C.orangeD}" stroke-width=".8" stroke-linejoin="round"/>` +
          `<rect x="5.5" y="-3" width="16.5" height="6" rx=".8" fill="${SAMPLE}" stroke="${C.orangeD}" stroke-width=".8"/>` +
          `<rect x="9" y="-3" width="10" height="6" fill="#FFE6D6" stroke="${C.orangeD}" stroke-width=".8"/>` +
          `<path d="M11 -3V3M17 -3V3" stroke="${SAMPLE}" stroke-width="1"/>`,
      ),
  },
  brushMarker: {
    l:
      strokeOf(5, SAMPLE, 0.55, 'butt') +
      `<path d="M4 19C7 22 11 24 14 23" fill="none" stroke="${SAMPLE}" stroke-opacity=".55" stroke-width="5"/>` +
      tool(
        `<path d="M0-1.8L2.6-2.4V2.4L0 1.8Z" fill="${SAMPLE}" stroke="${C.orangeD}" stroke-width=".7"/>` +
          `<rect x="2.6" y="-2.6" width="3" height="5.2" fill="${C.grayL}" stroke="${C.grayD}" stroke-width=".8"/>` +
          `<rect x="5.6" y="-3.4" width="16" height="6.8" rx="1.6" fill="#fff" stroke="${C.grayD}" stroke-width=".8"/>` +
          `<rect x="16" y="-3.4" width="2.4" height="6.8" fill="${SAMPLE}"/>`,
      ),
  },
  brushNaturalPencil: {
    l:
      `<path d="${bezPath(BS)}" fill="none" stroke="${SAMPLE}" stroke-width="1.5" stroke-dasharray="3 .7 1.5 .5 4 .6" stroke-linecap="round"/>` +
      `<path d="${bezPath(BS, 0.9, 0.3)}" fill="none" stroke="#F08C66" stroke-width=".8" stroke-dasharray="1 1.2 2 .8"/>` +
      `<g ${at(TIP[0], TIP[1])}>${pencilLocal(23, 5, 0.8)}</g>`,
  },
  brushWatercolor: {
    l:
      strokeOf(6.5, SAMPLE, 0.32) +
      strokeOf(3.2, SAMPLE, 0.32) +
      `<circle cx="4.5" cy="18" r="3.2" fill="${SAMPLE}" fill-opacity=".25"/>` +
      `<circle cx="9" cy="26" r="2.6" fill="${SAMPLE}" fill-opacity=".22"/>` +
      roundBrush('#F59A74', '#D9B26F', '#8A6A2E'),
  },

  // ---- Shape outline / fill ------------------------------------------------------
  outline: {
    s:
      `<path d="M1 14.5C3 12.5 4.5 15.5 7 13.5" fill="none" stroke="${C.blueD}" stroke-width="1.2" stroke-linecap="round"/>` +
      `<g ${at(4.5, 11.5)}>${pencilLocal(13, 3.6, 0.6)}</g>`,
  },
  fillStyle: { s: bucket16(C.orange, C.orangeD) },
  styleNone: {
    s: SWATCH_FRAME + `<path d="M3 13L13 3" stroke="${C.red}" stroke-width="1.6"/>`,
  },
  styleSolid: {
    s: `<rect x="1.5" y="1.5" width="13" height="13" fill="${C.orange}" stroke="${C.orangeD}"/>`,
  },
  styleCrayon: { s: swatchSpeckle() },
  styleMarker: {
    s:
      SWATCH_FRAME +
      `<path d="M2 5.5H14M2 10.5H14" stroke="${C.orange}" stroke-opacity=".55" stroke-width="5"/>` +
      `<path d="M2 8H14" stroke="${C.orange}" stroke-opacity=".35" stroke-width="2"/>`,
  },
  styleOil: {
    s:
      SWATCH_FRAME +
      `<rect x="2" y="2" width="12" height="12" fill="${C.orange}"/>` +
      `<path d="M2 3.5H14M2 7.5H14M2 11.5H14" stroke="#B8401A"/>` +
      `<path d="M2 5.5H14M2 9.5H14M2 13H14" stroke="#F8A27C"/>`,
  },
  styleNaturalPencil: {
    s:
      SWATCH_FRAME +
      `<path d="M2 6L6 2M2 10L10 2M2 14L14 2M6 14L14 6M10 14L14 10" stroke="${C.orange}" stroke-width=".9"/>`,
  },
  styleWatercolor: {
    s:
      SWATCH_FRAME +
      `<path d="M4 4.5C7 2.5 12 3.5 12.5 6.5C13 9 11.5 13 8 12.5C4.5 12 2 7 4 4.5Z" fill="${C.orange}" fill-opacity=".35" stroke="${C.orange}" stroke-opacity=".7"/>` +
      `<circle cx="7.5" cy="8" r="2.2" fill="${C.orange}" fill-opacity=".25"/>`,
  },
  sizeLines: {
    s:
      `<rect x="2" y="2" width="12" height="1" fill="${C.navy}"/>` +
      `<rect x="2" y="5" width="12" height="2" fill="${C.navy}"/>` +
      `<rect x="2" y="9" width="12" height="4" fill="${C.navy}"/>`,
    l:
      `<rect x="3" y="5" width="26" height="2" fill="${C.navy}"/>` +
      `<rect x="3" y="11" width="26" height="4" fill="${C.navy}"/>` +
      `<rect x="3" y="19" width="26" height="7" fill="${C.navy}"/>`,
  },
  editColors: {
    s:
      `<defs><linearGradient id="%ID%h"><stop offset="0" stop-color="#f00"/><stop offset=".17" stop-color="#ff0"/><stop offset=".33" stop-color="#0f0"/><stop offset=".5" stop-color="#0ff"/><stop offset=".67" stop-color="#00f"/><stop offset=".83" stop-color="#f0f"/><stop offset="1" stop-color="#f00"/></linearGradient>` +
      `<linearGradient id="%ID%v" x2="0" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>` +
      `<rect x="1.5" y="1.5" width="13" height="13" fill="url(#%ID%h)" stroke="${C.grayD}"/>` +
      `<rect x="2" y="2" width="12" height="12" fill="url(#%ID%v)"/>`,
    l:
      `<defs><linearGradient id="%ID%h"><stop offset="0" stop-color="#f00"/><stop offset=".17" stop-color="#ff0"/><stop offset=".33" stop-color="#0f0"/><stop offset=".5" stop-color="#0ff"/><stop offset=".67" stop-color="#00f"/><stop offset=".83" stop-color="#f0f"/><stop offset="1" stop-color="#f00"/></linearGradient>` +
      `<linearGradient id="%ID%v" x2="0" y2="1"><stop offset=".2" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient></defs>` +
      `<rect x="2.5" y="2.5" width="27" height="27" fill="url(#%ID%h)" stroke="${C.grayD}"/>` +
      `<rect x="3" y="3" width="26" height="26" fill="url(#%ID%v)"/>`,
  },

  // ---- View tab -------------------------------------------------------------------
  zoomIn: {
    s: mag(6.5, 6.5, 5, 1.2, 4.2, 2.4) + `<path d="M4 6H9V7H4ZM6 4H7V9H6Z" fill="${C.blue}"/>`,
    l: mag(13, 13, 9.5, 2, 8, 4.6) + `<path d="M8 11.5H18V14.5H8ZM11.5 8H14.5V18H11.5Z" fill="${C.blue}"/>`,
  },
  zoomOut: {
    s: mag(6.5, 6.5, 5, 1.2, 4.2, 2.4) + `<path d="M4 6H9V7H4Z" fill="${C.blue}"/>`,
    l: mag(13, 13, 9.5, 2, 8, 4.6) + `<path d="M8 11.5H18V14.5H8Z" fill="${C.blue}"/>`,
  },
  zoom100: {
    s:
      page(2.5, 1.5, 13.5, 14.5, 3) +
      `<path d="M4 9H5V13H4ZM6.5 9.5H8.5V12.5H6.5ZM10.5 9.5H12.5V12.5H10.5Z" fill="none"/>` +
      `<path d="M4.5 8.5V13" stroke="${C.blueD}"/><rect x="6.5" y="8.5" width="2" height="4" fill="none" stroke="${C.blueD}"/><rect x="10.5" y="8.5" width="2" height="4" fill="none" stroke="${C.blueD}"/>`,
    l:
      page(5.5, 2.5, 26.5, 29.5, 6) +
      `<path d="M9 18L11 16.5H12V26H10V19.2L9 19.8Z" fill="${C.blueD}"/>` +
      `<rect x="14.5" y="17" width="4" height="8.5" rx="2" fill="none" stroke="${C.blueD}" stroke-width="1.6"/>` +
      `<rect x="21" y="17" width="4" height="8.5" rx="2" fill="none" stroke="${C.blueD}" stroke-width="1.6"/>`,
  },
  fullscreen: {
    s:
      `<rect x="1.5" y="2.5" width="13" height="9" fill="${C.blueP}" stroke="#3B4450"/>` +
      `<rect x="6" y="12" width="4" height="1" fill="#7A838E"/><rect x="4" y="13" width="8" height="1" fill="#7A838E"/>` +
      `<path d="M4.5 9.5L10 4.5" stroke="${C.blueD}" stroke-width="1.3"/><path d="M12.5 4V8L8.5 4Z" fill="${C.blueD}"/>`,
    l:
      `<rect x="2.5" y="3.5" width="27" height="19" rx="1" fill="#3B4450" stroke="#262C33"/>` +
      `<rect x="4" y="5" width="24" height="16" fill="${C.blueP}"/>` +
      `<path d="M8 18L20.5 9" stroke="${C.blueD}" stroke-width="2.4" stroke-linecap="round"/>` +
      `<path d="M24.5 7V14.5L17.5 8Z" fill="${C.blueD}"/>` +
      `<path d="M5.5 6.5H9.5M5.5 6.5V10.5M26.5 19.5H22.5M26.5 19.5V15.5" stroke="${C.blue}" fill="none"/>` +
      `<rect x="13" y="23" width="6" height="3" fill="#7A838E"/>` +
      `<rect x="8.5" y="26.5" width="15" height="2" rx="1" fill="#A3ACB7" stroke="${C.grayD}"/>`,
  },
  thumbnail: {
    s:
      `<rect x="1.5" y="1.5" width="10" height="8" fill="#fff" stroke="${C.grayD}"/><rect x="2" y="2" width="9" height="2" fill="${C.blue}"/>` +
      `<rect x="6.5" y="7.5" width="8" height="7" fill="#fff" stroke="${C.grayD}"/><rect x="7" y="8" width="7" height="2" fill="${C.blueD}"/>` +
      `<path d="M7 14V12.5L9 11L11 12.5L14 11V14Z" fill="${C.green}"/>`,
    l:
      `<rect x="2.5" y="3.5" width="20" height="16" fill="#fff" stroke="${C.grayD}"/>` +
      `<rect x="3" y="4" width="19" height="3" fill="${C.blue}"/>` +
      lines(5, 10, 9, 2, 3, 1.5, C.grayL) +
      `<rect x="12.5" y="12.5" width="17" height="15" fill="#fff" stroke="${C.grayD}"/>` +
      `<rect x="13" y="13" width="16" height="3" fill="${C.blueD}"/>` +
      `<rect x="14" y="17" width="14" height="9" fill="${C.sky}"/>` +
      `<path d="M14 26V22L18 19L21.5 21.5L24.5 19.5L28 22.5V26Z" fill="${C.green}"/>`,
  },

  // ---- Text tab --------------------------------------------------------------------
  bold: {
    s: `<path d="M2 3H6.6L11 10.6V4.2H9.4V3H14V4.2H12.4V13H10.4L5.1 4.4V11.8H6.6V13H2V11.8H3.6V4.2H2Z" fill="${C.ink}"/>`,
  },
  italic: {
    s:
      `<g transform="translate(2.7 0) skewX(-15)">` +
      `<path d="M2.5 3H8V4.2H6.4V7.9L10.6 4.2H9.6V3H14V4.2H12.4L8.7 7.5L12.7 11.8H14V13H9.4V11.8H10.3L7.3 8.6L6.4 9.4V11.8H8V13H2.5V11.8H4.1V4.2H2.5Z" fill="${C.ink}"/>` +
      `</g>`,
  },
  underline: {
    s:
      `<path d="M11.2 4.6C10.4 3.5 9.2 3 7.8 3C5.7 3 4.4 4.1 4.4 5.7C4.4 9 11.4 7.4 11.4 10.6C11.4 12.1 10 13 8 13C6.4 13 5.2 12.4 4.4 11.3" fill="none" stroke="${C.ink}" stroke-width="1.7"/>` +
      `<rect x="2" y="14" width="12" height="1" fill="${C.ink}"/>`,
  },
  strikethrough: {
    s:
      `<text x="8" y="11.5" font-family="Segoe UI, Arial, sans-serif" font-weight="bold" font-size="8" text-anchor="middle" fill="${C.ink}">abc</text>` +
      `<rect x="1" y="9" width="14" height="1" fill="${C.red}"/>`,
  },
  opaque: {
    s:
      `<rect x="1.5" y="1.5" width="13" height="13" fill="#fff" stroke="${C.grayD}"/>` +
      `<g transform="translate(3.2 2.6) scale(.62)"><path d="${SERIF_A}" fill="${C.blueD}" fill-rule="evenodd"/></g>`,
  },
  transparent: {
    s:
      `<rect x="2" y="2" width="12" height="12" fill="#fff"/>` +
      checker(2, 2, 6, 2, '#D3D8DE') +
      `<rect x="1.5" y="1.5" width="13" height="13" fill="none" stroke="${C.grayD}" stroke-dasharray="2 1"/>` +
      `<g transform="translate(3.2 2.6) scale(.62)"><path d="${SERIF_A}" fill="${C.blueD}" fill-rule="evenodd"/></g>`,
  },

  // ---- Print preview -----------------------------------------------------------------
  onePage: {
    s: page(3.5, 1.5, 12.5, 14.5, 3) + lines(5, 5, 6, 4, 2),
  },
  twoPages: {
    s:
      `<rect x="0.5" y="2.5" width="7" height="11" fill="#fff" stroke="${C.gray}"/>` +
      lines(2, 5, 4, 3, 2) +
      `<rect x="8.5" y="2.5" width="7" height="11" fill="#fff" stroke="${C.gray}"/>` +
      lines(10, 5, 4, 3, 2),
  },
  prevPage: {
    s: `<path d="${poly([
      [8, 1.5],
      [14.5, 8],
      [10.5, 8],
      [10.5, 14.5],
      [5.5, 14.5],
      [5.5, 8],
      [1.5, 8],
    ])}" fill="#7DB3E8" stroke="${C.blueD}" stroke-linejoin="round"/>`,
    l: `<path d="${poly([
      [16, 2.5],
      [29.5, 16],
      [21.5, 16],
      [21.5, 29.5],
      [10.5, 29.5],
      [10.5, 16],
      [2.5, 16],
    ])}" fill="#7DB3E8" stroke="${C.blueD}" stroke-linejoin="round"/><path d="M16 4.6L5 15.2" stroke="#B9D9F6"/>`,
  },
  nextPage: {
    s: `<path d="${poly([
      [8, 14.5],
      [14.5, 8],
      [10.5, 8],
      [10.5, 1.5],
      [5.5, 1.5],
      [5.5, 8],
      [1.5, 8],
    ])}" fill="#7DB3E8" stroke="${C.blueD}" stroke-linejoin="round"/>`,
    l: `<path d="${poly([
      [16, 29.5],
      [29.5, 16],
      [21.5, 16],
      [21.5, 2.5],
      [10.5, 2.5],
      [10.5, 16],
      [2.5, 16],
    ])}" fill="#7DB3E8" stroke="${C.blueD}" stroke-linejoin="round"/><path d="M11.5 3.5V16" stroke="#B9D9F6"/>`,
  },
  closePreview: {
    s: `<path d="${poly([
      [3, 1.5],
      [8, 6.5],
      [13, 1.5],
      [14.5, 3],
      [9.5, 8],
      [14.5, 13],
      [13, 14.5],
      [8, 9.5],
      [3, 14.5],
      [1.5, 13],
      [6.5, 8],
      [1.5, 3],
    ])}" fill="#7E868F" stroke="#59616A" stroke-linejoin="round"/>`,
    l: `<path d="${poly([
      [6, 2.5],
      [16, 12.5],
      [26, 2.5],
      [29.5, 6],
      [19.5, 16],
      [29.5, 26],
      [26, 29.5],
      [16, 19.5],
      [6, 29.5],
      [2.5, 26],
      [12.5, 16],
      [2.5, 6],
    ])}" fill="#7E868F" stroke="#59616A" stroke-linejoin="round"/>`,
  },

  // ---- Misc --------------------------------------------------------------------------
  help: {
    s:
      `<circle cx="8" cy="8" r="7" fill="#2F6FCB"/>` +
      `<path d="M5.8 6.2C5.8 4.7 6.8 3.8 8.1 3.8C9.4 3.8 10.3 4.7 10.3 5.9C10.3 7.7 8.1 7.7 8.1 9.8" fill="none" stroke="#fff" stroke-width="1.6"/>` +
      `<circle cx="8.1" cy="11.9" r="1" fill="#fff"/>`,
  },
  language: {
    s:
      `<circle cx="8" cy="8" r="6.5" fill="${C.blueP}" stroke="${C.blueD}"/>` +
      `<path d="M1.5 8H14.5M8 1.5C5.6 3.6 5.6 12.4 8 14.5M8 1.5C10.4 3.6 10.4 12.4 8 14.5M2.7 4.7H13.3M2.7 11.3H13.3" fill="none" stroke="${C.blueD}" stroke-width="0.9"/>`,
  },
  chevronUp: { s: `<path d="M4.5 10L8 6.5L11.5 10" fill="none" stroke="#6D6D6D"/>` },
  chevronDown: { s: `<path d="M4.5 6.5L8 10L11.5 6.5" fill="none" stroke="#6D6D6D"/>` },
  dropdown: {
    s: `<path d="M4 6H11V7H10V8H9V9H8V10H7V9H6V8H5V7H4Z" fill="#444"/>`,
  },
  submenu: {
    s: `<path d="M6 4H7V5H8V6H9V7H10V8H9V9H8V10H7V11H6Z" fill="#444"/>`,
  },
  check: { s: `<path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="#333" stroke-width="1.6"/>` },
  statusCursor: {
    s:
      `<path d="M7.5 3V12M3 7.5H12" stroke="#444"/>` +
      `<path d="M7.5 0.5L10 3.5H5ZM7.5 14.5L5 11.5H10ZM0.5 7.5L3.5 5V10ZM14.5 7.5L11.5 10V5Z" fill="#444"/>`,
  },
  statusSelection: {
    s: `<rect x="1.5" y="2.5" width="12" height="10" fill="none" stroke="#444" stroke-dasharray="2 1"/>`,
  },
  statusImage: {
    s:
      `<rect x="1.5" y="2.5" width="11" height="9" fill="#fff" stroke="#444"/>` +
      `<path d="M3 13.5H14.5V4" fill="none" stroke="#999"/>` +
      `<rect x="11" y="10" width="3" height="3" fill="#444"/>`,
  },
  zoomMinusCircle: {
    s: `<circle cx="7.5" cy="7.5" r="6" fill="#fff" stroke="#555"/><rect x="4" y="7" width="7" height="1" fill="#333"/>`,
  },
  zoomPlusCircle: {
    s: `<circle cx="7.5" cy="7.5" r="6" fill="#fff" stroke="#555"/><path d="M4 7H11V8H4ZM7 4H8V11H7Z" fill="#333"/>`,
  },
};

let uid = 0;

/**
 * Returns a complete inline SVG string for `name` at `size` px.
 * Gradient ids (if any) are made unique per call so several copies of the same
 * icon can live in one document.
 */
export function icon(name: IconName, size: 16 | 32 = 16): string {
  const def = DEFS[name];
  let body: string;
  let vb: number;
  if (size === 32 && def.l !== undefined) {
    body = def.l;
    vb = 32;
  } else if (def.s !== undefined) {
    body = def.s;
    vb = 16;
  } else {
    body = def.l ?? '';
    vb = 32;
  }
  if (body.includes('%ID%')) {
    uid += 1;
    body = body.replaceAll('%ID%', `cpi${uid}`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${vb} ${vb}" aria-hidden="true" focusable="false">${body}</svg>`;
}
