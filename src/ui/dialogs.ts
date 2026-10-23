import type { App } from '../app/app';
import { BASIC_COLORS, hexToRgb, hsl240ToRgb, rgbToCss, rgbToHsl240, sameRgb } from '../app/color';
import { monochromeCanvas, scaleCanvas, skewCanvas } from '../app/imageops';
import { defaultImageSize, type PageSetup, type Units } from '../app/state';
import { APP_NAME, decimal, REPO_URL, t } from '../i18n';
import { PAPER_MM, pageLayout } from '../io/print';
import type { RGB } from '../paint/types';
import { SAVE_FORMATS, type SaveFormat } from '../io/files';
import { accel, formatAccel, formatMacAccel, MAC_ACCEL } from './accel';
import { alertDialog, showDialog, type DialogButton } from './dialog';
import { h, svg } from './dom';
import { icon } from './icons';

const MAX_PX = 10000;

function radio(
  name: string,
  label: string,
  checked: boolean,
  access?: string,
): { row: HTMLLabelElement; input: HTMLInputElement } {
  const input = h('input', { type: 'radio', name, checked });
  if (access) input.accessKey = access;
  return { row: h('label.dlg-check', {}, input, label), input };
}

function checkbox(label: string, checked: boolean): { row: HTMLLabelElement; input: HTMLInputElement } {
  const input = h('input', { type: 'checkbox', checked });
  return { row: h('label.dlg-check', {}, input, label), input };
}

function num(value: number | string, width = 56): HTMLInputElement {
  const i = h('input.dlg-input', { type: 'text', value: String(value), inputMode: 'decimal', autocomplete: 'off' });
  i.style.width = `${width}px`;
  return i;
}

function fieldset(legend: string, ...children: (Node | null)[]): HTMLFieldSetElement {
  return h('fieldset.dlg-group', {}, h('legend', {}, legend), ...children);
}

function labeled(label: string, input: HTMLElement, iconMarkup?: string): HTMLElement {
  const id = `i-${Math.random().toString(36).slice(2)}`;
  input.id = id;
  return h(
    'div.dlg-row',
    {},
    iconMarkup ? h('span.dlg-row-icon', { 'aria-hidden': 'true' }) : null,
    h('label', { htmlFor: id }, label),
    input,
  );
}

function okCancel(): DialogButton<boolean>[] {
  return [
    { label: t.dialog.ok, value: true, default: true },
    { label: t.dialog.cancel, value: false, cancel: true },
  ];
}

function parseNum(input: HTMLInputElement): number {
  return Number.parseFloat(input.value.replace(',', '.'));
}

// ---------------------------------------------------------------------------- Resize and Skew

const SVG_HEAD = '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">';
const RED = 'fill="none" stroke="#e01b1b" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"';
const RS_ICONS = {
  resizeH: `${SVG_HEAD}<rect x="3.5" y="13.5" width="29" height="17" fill="#fff" stroke="#333"/><path d="M5 7h26M9 3.5 5 7l4 3.5M27 3.5 31 7l-4 3.5" ${RED}/></svg>`,
  resizeV: `${SVG_HEAD}<rect x="3.5" y="3.5" width="17" height="29" fill="#fff" stroke="#333"/><path d="M28 5v26M24.5 9 28 5l3.5 4M24.5 27 28 31l3.5-4" ${RED}/></svg>`,
  skewH: `${SVG_HEAD}<path d="M10.5 15.5h22l-7 15h-22z" fill="#fff" stroke="#333"/><path d="M8 8h22M12 4.5 8 8l4 3.5M26 4.5 30 8l-4 3.5" ${RED}/></svg>`,
  skewV: `${SVG_HEAD}<path d="M4.5 10.5l14-6v21l-14 6z" fill="#fff" stroke="#333"/><path d="M27 6v24M23.5 10 27 6l3.5 4M23.5 26 27 30l3.5-4" ${RED}/></svg>`,
};

export async function resizeSkewDialog(app: App): Promise<void> {
  const sel = app.selection;
  const target = sel.rect ? { w: sel.rect.w, h: sel.rect.h } : { w: app.doc.width, h: app.doc.height };
  const byPercent = radio('rs-by', t.resize.percent, true);
  const byPixels = radio('rs-by', t.resize.pixels, false);
  const hIn = num(100);
  const vIn = num(100);
  const keep = checkbox(t.resize.keepRatio, true);
  const skewH = num(0);
  const skewV = num(0);
  const row = (iconName: keyof typeof RS_ICONS, label: string, input: HTMLInputElement): HTMLElement => {
    const id = `rs-${iconName}`;
    input.id = id;
    const ic = svg(RS_ICONS[iconName], 'rs-icon');
    ic.setAttribute('aria-hidden', 'true');
    return h('div.dlg-row.rs-row', {}, ic, h('label', { htmlFor: id }, label), input);
  };
  let percent = true;
  const toggleUnits = (toPercent: boolean): void => {
    if (toPercent === percent) return;
    const hv = parseNum(hIn);
    const vv = parseNum(vIn);
    if (toPercent) {
      hIn.value = String(Math.round((hv / target.w) * 100));
      vIn.value = String(Math.round((vv / target.h) * 100));
    } else {
      hIn.value = String(Math.round((hv / 100) * target.w));
      vIn.value = String(Math.round((vv / 100) * target.h));
    }
    percent = toPercent;
  };
  byPercent.input.addEventListener('change', () => toggleUnits(true));
  byPixels.input.addEventListener('change', () => toggleUnits(false));
  const sync = (from: HTMLInputElement, to: HTMLInputElement, fromIsH: boolean): void => {
    if (!keep.input.checked) return;
    const v = parseNum(from);
    if (!Number.isFinite(v)) return;
    if (percent) to.value = String(Math.round(v));
    else to.value = String(Math.max(1, Math.round(fromIsH ? (v * target.h) / target.w : (v * target.w) / target.h)));
  };
  hIn.addEventListener('input', () => sync(hIn, vIn, true));
  vIn.addEventListener('input', () => sync(vIn, hIn, false));

  const body = h(
    'div.rs-dialog',
    {},
    fieldset(
      t.resize.resize,
      h('div.dlg-row.rs-by', {}, h('span', {}, t.resize.by), byPercent.row, byPixels.row),
      row('resizeH', t.resize.horizontal, hIn),
      row('resizeV', t.resize.vertical, vIn),
      keep.row,
    ),
    fieldset(t.resize.skew, row('skewH', t.resize.horizontal, skewH), row('skewV', t.resize.vertical, skewV)),
  );
  const ok = await showDialog({
    title: t.resize.title,
    body,
    className: 'dlg-resize',
    focus: hIn,
    buttons: okCancel(),
    validate: () => {
      const a = parseNum(hIn);
      const b = parseNum(vIn);
      const sx = parseNum(skewH);
      const sy = parseNum(skewV);
      const maxPct = Math.floor((MAX_PX / Math.max(target.w, target.h)) * 100);
      const bad = (v: number, min: number, max: number): boolean =>
        !Number.isFinite(v) || v < min || v > max || Math.round(v) !== v;
      if (percent ? bad(a, 1, maxPct) || bad(b, 1, maxPct) : bad(a, 1, MAX_PX) || bad(b, 1, MAX_PX)) {
        void alertDialog(APP_NAME, t.resize.intRange(1, percent ? maxPct : MAX_PX), 'warning');
        return false;
      }
      if (bad(sx, -89, 89) || bad(sy, -89, 89)) {
        void alertDialog(APP_NAME, t.resize.intRange(-89, 89), 'warning');
        return false;
      }
      return true;
    },
  });
  if (!ok) return;
  const w = Math.max(1, Math.round(percent ? (target.w * parseNum(hIn)) / 100 : parseNum(hIn)));
  const hh = Math.max(1, Math.round(percent ? (target.h * parseNum(vIn)) / 100 : parseNum(vIn)));
  const sx = parseNum(skewH);
  const sy = parseNum(skewV);
  const background = app.store.state.color2;
  const op = (src: HTMLCanvasElement, bg: RGB | null): HTMLCanvasElement => {
    const scaled = w !== src.width || hh !== src.height ? scaleCanvas(src, w, hh) : src;
    return skewCanvas(scaled, sx, sy, bg);
  };
  if (sel.rect) {
    sel.transform((src) => op(src, null), false);
    app.markDirty();
  } else {
    app.commitLive();
    if (w === app.doc.width && hh === app.doc.height && !sx && !sy) return;
    app.replaceImage(op(app.doc.canvas, background));
  }
}

// ---------------------------------------------------------------------------- Image Properties

const UNIT_FACTOR: Record<Units, number> = { px: 1, in: 1 / 96, cm: 2.54 / 96 };

function formatUnits(px: number, u: Units): string {
  const v = px * UNIT_FACTOR[u];
  return u === 'px' ? String(Math.round(v)) : decimal(v, 2);
}

function formatBytes(n: number): string {
  if (n < 1024) return t.dialog.bytes(n);
  if (n < 1024 * 1024) return `${decimal(n / 1024, 1)}${t.dialog.kb}`;
  return `${decimal(n / 1024 / 1024, 1)}${t.dialog.mb}`;
}

export { formatBytes };

export async function propertiesDialog(app: App): Promise<void> {
  const st = app.store.state;
  let units: Units = st.units;
  const wIn = num(formatUnits(app.doc.width, units), 62);
  const hIn = num(formatUnits(app.doc.height, units), 62);
  const uIn = radio('pr-units', t.properties.inches, units === 'in');
  const uCm = radio('pr-units', t.properties.centimeters, units === 'cm');
  const uPx = radio('pr-units', t.properties.pixels, units === 'px');
  const cBw = radio('pr-colors', t.properties.blackWhite, st.monochrome);
  const cColor = radio('pr-colors', t.properties.color, !st.monochrome);
  const toPx = (input: HTMLInputElement): number => Math.round(parseNum(input) / UNIT_FACTOR[units]);
  const setUnits = (u: Units): void => {
    const w = toPx(wIn);
    const hh = toPx(hIn);
    units = u;
    wIn.value = formatUnits(w, u);
    hIn.value = formatUnits(hh, u);
  };
  uIn.input.addEventListener('change', () => setUnits('in'));
  uCm.input.addEventListener('change', () => setUnits('cm'));
  uPx.input.addEventListener('change', () => setUnits('px'));
  const def = h(
    'button.dlg-button',
    {
      type: 'button',
      onclick: () => {
        const d = defaultImageSize();
        wIn.value = formatUnits(d.w, units);
        hIn.value = formatUnits(d.h, units);
      },
    },
    t.properties.default,
  );
  const saved = st.lastSaved
    ? new Date(st.lastSaved).toLocaleString(t.locale, { dateStyle: 'short', timeStyle: 'short' })
    : t.properties.notAvailable;
  const body = h(
    'div.pr-dialog',
    {},
    fieldset(
      t.properties.fileAttributes,
      h(
        'dl.pr-attrs',
        {},
        h('dt', {}, t.properties.lastSaved),
        h('dd', {}, saved),
        h('dt', {}, t.properties.sizeOnDisk),
        h('dd', {}, st.fileSize !== null ? formatBytes(st.fileSize) : t.properties.notAvailable),
        h('dt', {}, t.properties.resolution),
        h('dd', {}, t.properties.dpi(96)),
      ),
    ),
    h(
      'div.pr-cols',
      {},
      fieldset(t.properties.units, uIn.row, uCm.row, uPx.row),
      fieldset(t.properties.colors, cBw.row, cColor.row),
    ),
    h('div.pr-size', {}, labeled(t.properties.width, wIn), labeled(t.properties.height, hIn), def),
  );
  const ok = await showDialog({
    title: t.properties.title,
    body,
    className: 'dlg-properties',
    focus: wIn,
    buttons: okCancel(),
    validate: () => {
      const w = toPx(wIn);
      const hh = toPx(hIn);
      if (!(w >= 1 && w <= MAX_PX && hh >= 1 && hh <= MAX_PX)) {
        void alertDialog(APP_NAME, t.properties.sizeRange(MAX_PX), 'warning');
        return false;
      }
      return true;
    },
  });
  if (!ok) return;
  app.store.set({ units });
  const w = toPx(wIn);
  const hh = toPx(hIn);
  if (w !== app.doc.width || hh !== app.doc.height) app.resizeCanvas(w, hh);
  if (cBw.input.checked && !st.monochrome) {
    const go = await showDialog({
      title: APP_NAME,
      body: h('div.dlg-message', {}, h('p', {}, t.properties.monochromeWarning)),
      buttons: okCancel(),
    });
    if (go) {
      app.commitLive();
      app.replaceImage(monochromeCanvas(app.doc.canvas));
      app.store.set({ monochrome: true });
    }
  } else if (cColor.input.checked && st.monochrome) {
    app.store.set({ monochrome: false });
  }
}

// ---------------------------------------------------------------------------- Edit Colors

let sessionCustom: (RGB | null)[] = Array.from({ length: 16 }, () => null);

export async function editColorsDialog(initial: RGB): Promise<RGB | null> {
  let [hue, sat, lum] = rgbToHsl240(initial);
  let rgb: RGB = initial;

  const field = h('canvas.ec-field', { width: 175, height: 187, tabIndex: 0, 'aria-label': t.editColors.hueSat });
  const lumBar = h('canvas.ec-lum', { width: 10, height: 187, tabIndex: 0, 'aria-label': t.editColors.lumBar });
  const arrow = h('div.ec-arrow', { 'aria-hidden': 'true' });
  const sample = h('div.ec-sample');
  const inputs = {
    hue: num(hue, 32),
    sat: num(sat, 32),
    lum: num(lum, 32),
    r: num(rgb[0], 32),
    g: num(rgb[1], 32),
    b: num(rgb[2], 32),
  };
  const fctx = field.getContext('2d') as CanvasRenderingContext2D;
  const lctx = lumBar.getContext('2d') as CanvasRenderingContext2D;
  // Hue (x) × saturation (y) field at luminosity 120, like the Windows color picker.
  const img = fctx.createImageData(175, 187);
  for (let y = 0; y < 187; y++) {
    for (let x = 0; x < 175; x++) {
      const [r, g, b] = hsl240ToRgb((x * 239) / 174, 240 - (y * 240) / 186, 120);
      const k = (y * 175 + x) * 4;
      img.data[k] = r;
      img.data[k + 1] = g;
      img.data[k + 2] = b;
      img.data[k + 3] = 255;
    }
  }

  const basicGrid = h('div.ec-grid.ec-basic', { role: 'listbox', 'aria-label': t.editColors.basic });
  BASIC_COLORS.forEach((hex) => {
    const c = hexToRgb(hex);
    const b = h('button.ec-swatch', { type: 'button', title: hex, onclick: () => setRgb(c, true) });
    b.style.background = hex;
    basicGrid.append(b);
  });
  const customGrid = h('div.ec-grid.ec-custom', { role: 'listbox', 'aria-label': t.editColors.custom });
  let customSlot = sessionCustom.findIndex((c) => c === null);
  if (customSlot < 0) customSlot = 0;
  const renderCustom = (): void => {
    customGrid.replaceChildren(
      ...sessionCustom.map((c, i) => {
        const b = h('button.ec-swatch', { type: 'button', onclick: () => (c ? setRgb(c, true) : (customSlot = i)) });
        b.style.background = c ? rgbToCss(c) : '#fff';
        return b;
      }),
    );
  };
  renderCustom();

  const draw = (): void => {
    fctx.putImageData(img, 0, 0);
    const x = Math.round((hue / 239) * 174);
    const y = Math.round(((240 - sat) / 240) * 186);
    fctx.fillStyle = '#000';
    fctx.fillRect(x - 1, y - 9, 3, 5);
    fctx.fillRect(x - 1, y + 5, 3, 5);
    fctx.fillRect(x - 9, y - 1, 5, 3);
    fctx.fillRect(x + 5, y - 1, 5, 3);
    for (let yy = 0; yy < 187; yy++) {
      lctx.fillStyle = rgbToCss(hsl240ToRgb(hue, sat, 240 - (yy * 240) / 186));
      lctx.fillRect(0, yy, 10, 1);
    }
    arrow.style.top = `${Math.round(((240 - lum) / 240) * 186)}px`;
    sample.style.background = rgbToCss(rgb);
    inputs.hue.value = String(hue);
    inputs.sat.value = String(sat);
    inputs.lum.value = String(lum);
    inputs.r.value = String(rgb[0]);
    inputs.g.value = String(rgb[1]);
    inputs.b.value = String(rgb[2]);
  };
  const setHsl = (hh: number, s: number, l: number): void => {
    hue = Math.min(239, Math.max(0, Math.round(hh)));
    sat = Math.min(240, Math.max(0, Math.round(s)));
    lum = Math.min(240, Math.max(0, Math.round(l)));
    rgb = hsl240ToRgb(hue, sat, lum);
    draw();
  };
  const setRgb = (c: RGB, fromSwatch = false): void => {
    rgb = c;
    [hue, sat, lum] = rgbToHsl240(c);
    draw();
    if (fromSwatch) sample.focus?.();
  };
  const dragOn = (el: HTMLElement, fn: (x: number, y: number) => void): void => {
    el.addEventListener('pointerdown', (e) => {
      el.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      const go = (ev: PointerEvent): void => fn(ev.clientX - r.left, ev.clientY - r.top);
      go(e);
      const move = (ev: PointerEvent): void => go(ev);
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', () => el.removeEventListener('pointermove', move), { once: true });
    });
  };
  dragOn(field, (x, y) =>
    setHsl(
      (Math.min(174, Math.max(0, x)) / 174) * 239,
      240 - (Math.min(186, Math.max(0, y)) / 186) * 240,
      lum === 0 || lum === 240 ? 120 : lum,
    ),
  );
  const lumWrap = h('div.ec-lumwrap', {}, lumBar, arrow);
  dragOn(lumWrap, (_x, y) => setHsl(hue, sat, 240 - (Math.min(186, Math.max(0, y)) / 186) * 240));
  for (const key of ['hue', 'sat', 'lum'] as const) {
    inputs[key].addEventListener('change', () =>
      setHsl(parseNum(inputs.hue) || 0, parseNum(inputs.sat) || 0, parseNum(inputs.lum) || 0),
    );
  }
  for (const key of ['r', 'g', 'b'] as const) {
    inputs[key].addEventListener('change', () => {
      const v = (i: HTMLInputElement): number => Math.min(255, Math.max(0, Math.round(parseNum(i) || 0)));
      setRgb([v(inputs.r), v(inputs.g), v(inputs.b)]);
    });
  }
  const add = h(
    'button.dlg-button.ec-add',
    {
      type: 'button',
      onclick: () => {
        sessionCustom = sessionCustom.slice();
        sessionCustom[customSlot] = rgb;
        customSlot = (customSlot + 1) % sessionCustom.length;
        renderCustom();
      },
    },
    t.editColors.add,
  );
  const lbl = (text: string, input: HTMLInputElement): HTMLElement => labeled(text, input);
  const body = h(
    'div.ec-dialog',
    {},
    h(
      'div.ec-left',
      {},
      h('div.ec-caption', {}, t.editColors.basic),
      basicGrid,
      h('div.ec-caption', {}, t.editColors.custom),
      customGrid,
      h('button.dlg-button.ec-define', { type: 'button', disabled: true }, t.editColors.define),
    ),
    h(
      'div.ec-right',
      {},
      h('div.ec-pickers', {}, field, lumWrap),
      h(
        'div.ec-values',
        {},
        h('div.ec-sample-wrap', {}, sample, h('div.ec-sample-label', {}, t.editColors.solid)),
        h(
          'div.ec-col',
          {},
          lbl(t.editColors.hue, inputs.hue),
          lbl(t.editColors.sat, inputs.sat),
          lbl(t.editColors.lum, inputs.lum),
        ),
        h(
          'div.ec-col',
          {},
          lbl(t.editColors.red, inputs.r),
          lbl(t.editColors.green, inputs.g),
          lbl(t.editColors.blue, inputs.b),
        ),
      ),
      add,
    ),
  );
  draw();
  const ok = await showDialog({
    title: t.editColors.title,
    body,
    className: 'dlg-editcolors',
    buttons: okCancel(),
  });
  return ok ? rgb : null;
}

/** Adds a color to the palette's custom row: first free slot or, when full, shifts the others. */
export function pushCustomColor(list: readonly (RGB | null)[], c: RGB): (RGB | null)[] {
  if (list.some((x) => x !== null && sameRgb(x, c))) return [...list];
  const next = [...list];
  const free = next.indexOf(null);
  if (free >= 0) next[free] = c;
  else {
    next.shift();
    next.push(c);
  }
  return next;
}

// ---------------------------------------------------------------------------- Page Setup

export async function pageSetupDialog(app: App): Promise<void> {
  const st = app.store.state;
  const s: PageSetup = structuredClone(st.pageSetup);
  const paper = h('select.dlg-select', {});
  for (const key of Object.keys(PAPER_MM) as PageSetup['paper'][])
    paper.append(h('option', { value: key, selected: key === s.paper }, t.pageSetup.papers[key]));
  const source = h('select.dlg-select', { disabled: true }, h('option', {}, ''));
  const portrait = radio('ps-or', t.pageSetup.portrait, !s.landscape);
  const landscape = radio('ps-or', t.pageSetup.landscape, s.landscape);
  const m = {
    left: num(s.margins.left),
    right: num(s.margins.right),
    top: num(s.margins.top),
    bottom: num(s.margins.bottom),
  };
  const cH = checkbox(t.pageSetup.horizontally, s.centerH);
  const cV = checkbox(t.pageSetup.vertically, s.centerV);
  const adjust = radio('ps-scale', t.pageSetup.adjustTo, s.scaleMode === 'adjust');
  const fit = radio('ps-scale', t.pageSetup.fitTo, s.scaleMode === 'fit');
  const pct = num(s.scalePercent, 40);
  const fw = num(s.fitW, 32);
  const fh = num(s.fitH, 32);
  const preview = h('div.ps-preview');
  const read = (): void => {
    s.paper = paper.value as PageSetup['paper'];
    s.landscape = landscape.input.checked;
    for (const k of ['left', 'right', 'top', 'bottom'] as const) {
      const v = parseNum(m[k]);
      if (Number.isFinite(v) && v >= 0) s.margins[k] = v;
    }
    s.centerH = cH.input.checked;
    s.centerV = cV.input.checked;
    s.scaleMode = fit.input.checked ? 'fit' : 'adjust';
    const p = parseNum(pct);
    if (Number.isFinite(p) && p >= 10 && p <= 400) s.scalePercent = Math.round(p);
    const a = parseNum(fw);
    const b = parseNum(fh);
    if (Number.isFinite(a) && a >= 1 && a <= 20) s.fitW = Math.round(a);
    if (Number.isFinite(b) && b >= 1 && b <= 20) s.fitH = Math.round(b);
    pct.disabled = s.scaleMode !== 'adjust';
    fw.disabled = fh.disabled = s.scaleMode !== 'fit';
    drawPreview();
  };
  const drawPreview = (): void => {
    const l = pageLayout(s, app.doc.width, app.doc.height);
    const k = 150 / Math.max(l.pageW, l.pageH);
    preview.replaceChildren();
    const page = h('div.ps-page');
    page.style.width = `${l.pageW * k}px`;
    page.style.height = `${l.pageH * k}px`;
    const area = h('div.ps-area');
    area.style.left = `${s.margins.left * k}px`;
    area.style.top = `${s.margins.top * k}px`;
    area.style.width = `${l.printableW * k}px`;
    area.style.height = `${l.printableH * k}px`;
    const imgBox = h('div.ps-img');
    imgBox.style.left = `${l.offsetX * k}px`;
    imgBox.style.top = `${l.offsetY * k}px`;
    imgBox.style.width = `${Math.min(l.imageW, l.printableW) * k}px`;
    imgBox.style.height = `${Math.min(l.imageH, l.printableH) * k}px`;
    area.append(imgBox);
    page.append(area);
    preview.append(page);
  };
  const body = h(
    'div.ps-dialog',
    { oninput: read, onchange: read },
    fieldset(t.pageSetup.preview, preview),
    h(
      'div.ps-right',
      {},
      fieldset(t.pageSetup.paper, labeled(t.pageSetup.size, paper), labeled(t.pageSetup.source, source)),
      h(
        'div.ps-cols',
        {},
        fieldset(t.pageSetup.orientation, portrait.row, landscape.row),
        fieldset(
          t.pageSetup.margins,
          h(
            'div.ps-margins',
            {},
            labeled(t.pageSetup.left, m.left),
            labeled(t.pageSetup.top, m.top),
            labeled(t.pageSetup.right, m.right),
            labeled(t.pageSetup.bottom, m.bottom),
          ),
        ),
      ),
      h(
        'div.ps-cols',
        {},
        fieldset(t.pageSetup.centering, cH.row, cV.row),
        fieldset(
          t.pageSetup.scaling,
          h('div.dlg-row', {}, adjust.row, pct, h('span.ps-note', {}, t.pageSetup.normalSize)),
          h('div.dlg-row', {}, fit.row, fw, h('span', {}, t.pageSetup.by), fh, h('span', {}, t.pageSetup.pages)),
        ),
      ),
    ),
  );
  read();
  const ok = await showDialog({
    title: t.pageSetup.title,
    body,
    className: 'dlg-pagesetup',
    buttons: okCancel(),
  });
  if (ok) {
    read();
    app.store.set({ pageSetup: s });
  }
}

// ---------------------------------------------------------------------------- Save As (without File System Access)

export async function saveAsDialog(
  name: string,
  format: SaveFormat,
): Promise<{ name: string; format: SaveFormat } | null> {
  const nameIn = h('input.dlg-input.sa-name', { type: 'text', value: name, autocomplete: 'off', spellcheck: false });
  const typeSel = h('select.dlg-select.sa-type', {});
  for (const f of SAVE_FORMATS)
    typeSel.append(h('option', { value: f.id, selected: f.id === format }, t.files.formats[f.id]));
  const body = h(
    'div.sa-dialog',
    {},
    labeled(t.saveAs.fileName, nameIn),
    labeled(t.saveAs.type, typeSel),
    h('p.dlg-note', {}, t.saveAs.downloadNote),
  );
  const ok = await showDialog({
    title: t.saveAs.title,
    body,
    className: 'dlg-saveas',
    focus: nameIn,
    buttons: [
      { label: t.dialog.save, value: true, default: true },
      { label: t.dialog.cancel, value: false, cancel: true },
    ],
    validate: () => nameIn.value.trim().length > 0 && !/[\\/:*?"<>|]/.test(nameIn.value),
  });
  if (!ok) return null;
  return { name: nameIn.value.trim(), format: typeSel.value as SaveFormat };
}

// ---------------------------------------------------------------------------- About and Help

export async function aboutDialog(): Promise<void> {
  const body = h(
    'div.about-dialog',
    {},
    h('div.about-hero', {}, svg(icon('app', 32), 'about-logo'), h('div.about-name', {}, APP_NAME)),
    h('hr'),
    h(
      'div.about-text',
      {},
      h('p', {}, t.about.version(__APP_VERSION__)),
      h('p', {}, t.about.text),
      h(
        'p',
        {},
        t.about.openSource,
        ' ',
        h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, REPO_URL.replace('https://', '')),
      ),
      h('p.about-legal', {}, t.about.legal),
    ),
  );
  await showDialog({
    title: t.about.title,
    body,
    className: 'dlg-about',
    buttons: [{ label: t.dialog.ok, value: true, default: true, cancel: true }],
  });
}

export async function helpDialog(): Promise<void> {
  const mac = /Mac|iPhone|iPad/.test(navigator.platform);
  // On a Mac, also show the ⌘ equivalent (the one the keyboard handler accepts).
  const keys = (...cmds: string[]): string =>
    cmds
      .map((cmd) => {
        const a = accel(cmd);
        const pc = a ? formatAccel(a) : '';
        const m = mac ? MAC_ACCEL[cmd] : undefined;
        return m ? `${formatMacAccel(m)} · ${pc}` : pc;
      })
      .join(' / ');
  const r = t.help.rows;
  const { ctrl, wheel } = t.keys;
  const rows: [string, string][] = [
    [keys('file.new'), r.new],
    [keys('file.open'), r.open],
    [keys('file.save'), r.save],
    [keys('file.saveAs'), r.saveAs],
    [keys('file.print'), r.print],
    [keys('edit.undo'), r.undo],
    [keys('edit.redo'), r.redo],
    [keys('edit.cut', 'edit.copy', 'edit.paste'), r.clipboard],
    [keys('edit.selectAll'), r.selectAll],
    [keys('edit.delete'), r.delete],
    [keys('edit.crop'), r.crop],
    [keys('edit.resize'), r.resize],
    [keys('edit.invertColor'), r.invertColor],
    [keys('file.properties'), r.properties],
    [keys('view.rulers', 'view.grid'), r.rulersGrid],
    [`${keys('view.zoomIn', 'view.zoomOut')}, ${ctrl}+${wheel}`, r.zoom],
    [keys('view.fullscreen'), r.fullscreen],
    [`${ctrl}+ + / −`, r.size],
    ['Alt', r.keytips],
  ];
  const body = h(
    'div.help-dialog',
    {},
    h('h2', {}, t.help.shortcuts),
    h(
      'table.help-table',
      {},
      h('tbody', {}, ...rows.map(([k, v]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, v)))),
    ),
    h('h2', {}, t.help.tricks),
    h('ul', {}, ...t.help.tips.map((tip) => h('li', {}, tip))),
  );
  await showDialog({
    title: t.help.title,
    body,
    className: 'dlg-help',
    buttons: [{ label: t.dialog.ok, value: true, default: true, cancel: true }],
  });
}
