import { describe, expect, it } from 'vitest';
import { ICON_NAMES, icon, type IconName } from './icons';
import { cursorCss, type CursorName } from './cursors';

/** Every name the UI relies on; `satisfies` makes the compiler check it against IconName. */
// prettier-ignore
const EXPECTED_ICONS = [
  'app', 'save', 'undo', 'redo', 'new', 'open', 'print', 'printPreview', 'email',
  'saveAs', 'scanner', 'wallpaper', 'properties', 'about', 'exit', 'pageSetup',
  'formatPng', 'formatJpg', 'formatBmp', 'formatGif', 'formatOther',
  'paste', 'pasteFrom', 'cut', 'copy', 'selectRect', 'selectFree', 'selectAll', 'invertSelection',
  'deleteSelection', 'crop', 'resize', 'rotate', 'rotateRight', 'rotateLeft', 'rotate180',
  'flipVertical', 'flipHorizontal', 'invertColor', 'pencil', 'fill', 'text', 'eraser', 'colorPicker', 'magnifier',
  'brushBrush', 'brushCalligraphy1', 'brushCalligraphy2', 'brushAirbrush', 'brushOil', 'brushCrayon',
  'brushMarker', 'brushNaturalPencil', 'brushWatercolor',
  'outline', 'fillStyle', 'styleNone', 'styleSolid', 'styleCrayon', 'styleMarker', 'styleOil',
  'styleNaturalPencil', 'styleWatercolor', 'sizeLines', 'editColors',
  'zoomIn', 'zoomOut', 'zoom100', 'fullscreen', 'thumbnail',
  'bold', 'italic', 'underline', 'strikethrough', 'opaque', 'transparent',
  'onePage', 'twoPages', 'prevPage', 'nextPage', 'closePreview',
  'help', 'language', 'chevronUp', 'chevronDown', 'dropdown', 'submenu', 'check',
  'statusCursor', 'statusSelection', 'statusImage', 'zoomMinusCircle', 'zoomPlusCircle',
] as const satisfies readonly IconName[];

const ALL_CURSORS = {
  pencil: true,
  fill: true,
  picker: true,
  magnifier: true,
  airbrush: true,
  brushCross: true,
  shapeCross: true,
  selectCross: true,
  move: true,
  resizeNS: true,
  resizeEW: true,
  resizeNWSE: true,
  resizeNESW: true,
} satisfies Record<CursorName, true>;
const CURSOR_NAMES = Object.keys(ALL_CURSORS) as CursorName[];

const FALLBACKS = new Set([
  'crosshair',
  'move',
  'ns-resize',
  'ew-resize',
  'nwse-resize',
  'nesw-resize',
  'default',
  'zoom-in',
]);

const TAG = /<(\/?)([a-zA-Z][\w:-]*)((?:\s+[a-zA-Z_:][\w:.-]*="[^"<]*")*)\s*(\/?)>/y;

/**
 * Minimal XML well-formedness check: balanced tags, quoted and unique
 * attributes, no stray `<`/`>`/`&` in text. Catches the mistakes that make a
 * browser silently drop an SVG used as an image (e.g. a duplicated attribute).
 * Returns a description of the first problem, or null.
 */
function xmlProblem(xml: string): string | null {
  const stack: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf('<', i);
    const text = xml.slice(i, lt === -1 ? xml.length : lt);
    if (/[<>]|&(?!(?:amp|lt|gt|quot|apos|#\d+);)/.test(text)) return `stray characters in text "${text}"`;
    if (lt === -1) break;
    TAG.lastIndex = lt;
    const m = TAG.exec(xml);
    if (!m) return `malformed tag near "${xml.slice(lt, lt + 60)}"`;
    const [all, closing, name = '', attrs = '', selfClosing] = m;
    const names = [...attrs.matchAll(/([a-zA-Z_:][\w:.-]*)="/g)].map((a) => a[1]);
    if (new Set(names).size !== names.length) return `duplicate attribute in <${name}${attrs}>`;
    if (closing) {
      const open = stack.pop();
      if (open !== name) return `</${name}> closes <${open ?? ''}>`;
    } else if (!selfClosing) {
      stack.push(name);
    }
    i = lt + all.length;
  }
  return stack.length === 0 ? null : `unclosed <${stack.join('>, <')}>`;
}

function iconProblems(name: IconName, size: 16 | 32): string[] {
  const svg = icon(name, size);
  const out: string[] = [];
  const need = (ok: boolean, what: string): void => {
    if (!ok) out.push(`${name}@${size}: ${what}`);
  };
  need(svg.startsWith('<svg'), 'does not start with <svg');
  need(svg.endsWith('</svg>'), 'does not end with </svg>');
  need(svg.includes('xmlns="http://www.w3.org/2000/svg"'), 'missing xmlns');
  need(svg.includes(`width="${size}" height="${size}"`), 'wrong width/height');
  need(/viewBox="0 0 (16 16|32 32)"/.test(svg), 'missing viewBox');
  need(svg.includes('aria-hidden="true"') && svg.includes('focusable="false"'), 'missing a11y attributes');
  need(!/<image|<script|<foreignObject|href="(?!#)|url\((?!#)/.test(svg), 'external reference');
  need(!/NaN|undefined|%ID%/.test(svg), 'unresolved value');
  const xml = xmlProblem(svg);
  need(xml === null, xml ?? '');

  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
  need(doc.documentElement.nodeName.toLowerCase() === 'svg', 'root is not <svg>');
  need(doc.getElementsByTagName('parsererror').length === 0, 'parser error');
  need(doc.documentElement.childNodes.length > 0, 'empty drawing');
  return out;
}

const ids = (s: string): string[] => [...s.matchAll(/id="([^"]+)"/g)].map((m) => m[1] ?? '');

describe('icons', () => {
  it('exposes exactly the expected, unique names', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
    expect([...ICON_NAMES].toSorted()).toEqual([...EXPECTED_ICONS].toSorted());
  });

  it.each([16, 32] as const)('renders every icon as a well-formed standalone %ipx SVG', (size) => {
    expect(ICON_NAMES.flatMap((name) => iconProblems(name, size))).toEqual([]);
  });

  it('defaults to 16px', () => {
    expect(icon('save')).toContain('width="16" height="16"');
  });

  it('keeps gradient ids unique between copies of the same icon', () => {
    const a = ids(icon('editColors', 32));
    const b = ids(icon('editColors', 32));
    expect(a.length).toBeGreaterThan(0);
    expect(a.filter((id) => b.includes(id))).toEqual([]);
  });
});

function cursorProblems(name: CursorName): string[] {
  const css = cursorCss(name);
  const m = /^url\("data:image\/svg\+xml,([^"\s]+)"\) (\d+) (\d+), ([a-z-]+)$/.exec(css);
  if (!css.startsWith('url("data:image/svg+xml') || !m) return [`${name}: unexpected format ${css.slice(-60)}`];
  const [, data = '', x, y, fallback = ''] = m;
  const out: string[] = [];
  const need = (ok: boolean, what: string): void => {
    if (!ok) out.push(`${name}: ${what}`);
  };
  const hx = Number(x);
  const hy = Number(y);
  need(hx >= 0 && hx <= 31 && hy >= 0 && hy <= 31, `hotspot ${hx},${hy} out of range`);
  need(FALLBACKS.has(fallback), `unexpected fallback ${fallback}`);
  // Properly percent-encoded: no raw reserved characters, every % starts an escape.
  need(!/[#<>"' ]|%(?![0-9A-F]{2})/.test(data), 'badly encoded data URL');
  const svg = decodeURIComponent(data);
  need(svg.startsWith('<svg') && svg.endsWith('</svg>'), 'not an SVG document');
  need(svg.includes('width="32" height="32"'), 'not 32x32');
  const xml = xmlProblem(svg);
  need(xml === null, xml ?? '');
  return out;
}

describe('cursors', () => {
  it('builds a valid CSS cursor value for every cursor', () => {
    expect(CURSOR_NAMES.flatMap(cursorProblems)).toEqual([]);
  });
});
