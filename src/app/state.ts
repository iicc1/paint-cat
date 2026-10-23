import { isLang, t, type Lang } from '../i18n';
import type { BrushKind, Point, RGB, ShapeKind, ShapeStyle } from '../paint/types';
import { BLACK, WHITE } from './color';

export type ToolId = 'select' | 'pencil' | 'fill' | 'text' | 'eraser' | 'picker' | 'magnifier' | 'brush' | 'shape';
export type TabId = 'home' | 'view' | 'text' | 'preview';
export type QatItem = 'new' | 'open' | 'save' | 'print' | 'printPreview' | 'email' | 'undo' | 'redo';
export type Units = 'in' | 'cm' | 'px';

export interface FontState {
  family: string;
  size: number;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
}

export interface PageSetup {
  paper: 'A4' | 'A3' | 'A5' | 'Letter' | 'Legal';
  landscape: boolean;
  margins: { left: number; right: number; top: number; bottom: number }; // mm
  centerH: boolean;
  centerV: boolean;
  scaleMode: 'adjust' | 'fit';
  scalePercent: number;
  fitW: number;
  fitH: number;
}

export interface RecentEntry {
  id: string;
  name: string;
}

export interface AppState {
  tool: ToolId;
  previousTool: ToolId;
  brush: BrushKind;
  shape: ShapeKind;
  selectMode: 'rect' | 'free';
  transparentSelection: boolean;
  outline: ShapeStyle;
  fill: ShapeStyle;
  pencilSize: number;
  eraserSize: number;
  shapeSize: number;
  brushSizes: Record<BrushKind, number>;
  color1: RGB;
  color2: RGB;
  activeColor: 1 | 2;
  customColors: (RGB | null)[];

  zoom: number;
  showRulers: boolean;
  showGrid: boolean;
  showStatusBar: boolean;
  showThumbnail: boolean;
  fullscreen: boolean;

  tab: TabId;
  ribbonMinimized: boolean;
  ribbonPopup: boolean;
  qatBelow: boolean;
  qat: Record<QatItem, boolean>;

  textEditing: boolean;
  font: FontState;
  textOpaque: boolean;

  printPreview: boolean;
  pageSetup: PageSetup;

  /** File opened or saved (null = untitled image). */
  fileName: string | null;
  dirty: boolean;
  fileSize: number | null;
  lastSaved: number | null;
  docWidth: number;
  docHeight: number;
  units: Units;
  monochrome: boolean;

  cursor: Point | null;
  selectionSize: { w: number; h: number } | null;
  hasSelection: boolean;
  hasLiveShape: boolean;
  canUndo: boolean;
  canRedo: boolean;
  recent: RecentEntry[];
  /** Language chosen in the picker (null = the browser's). */
  lang: Lang | null;
}

export const DEFAULT_BRUSH_SIZES: Record<BrushKind, number> = {
  brush: 3,
  calligraphy1: 5,
  calligraphy2: 5,
  airbrush: 8,
  oil: 30,
  crayon: 30,
  marker: 30,
  naturalPencil: 4,
  watercolor: 30,
};

export const PENCIL_SIZES = [1, 2, 3, 4] as const;
export const ERASER_SIZES = [4, 6, 8, 10] as const;
export const SHAPE_SIZES = [1, 3, 5, 8] as const;

/**
 * Size of a new image: 60 % of the screen, like Paint (1152 × 648 on 1920 × 1080).
 * CSS pixels are used so that at 100 % it fits on Retina screens.
 */
export function defaultImageSize(): { w: number; h: number } {
  const sw = typeof screen !== 'undefined' ? screen.width : 0;
  const sh = typeof screen !== 'undefined' ? screen.height : 0;
  const w = Math.round((sw > 0 ? sw : 1920) * 0.6);
  const h = Math.round((sh > 0 ? sh : 1080) * 0.6);
  return { w: Math.min(Math.max(w, 320), 4000), h: Math.min(Math.max(h, 240), 4000) };
}

export function initialState(): AppState {
  const { w, h } = defaultImageSize();
  return {
    tool: 'brush',
    previousTool: 'brush',
    brush: 'brush',
    shape: 'line',
    selectMode: 'rect',
    transparentSelection: false,
    outline: 'solid',
    fill: 'none',
    pencilSize: 1,
    eraserSize: 8,
    shapeSize: 1,
    brushSizes: { ...DEFAULT_BRUSH_SIZES },
    color1: BLACK,
    color2: WHITE,
    activeColor: 1,
    customColors: Array.from({ length: 10 }, () => null),

    zoom: 1,
    showRulers: false,
    showGrid: false,
    showStatusBar: true,
    showThumbnail: false,
    fullscreen: false,

    tab: 'home',
    ribbonMinimized: false,
    ribbonPopup: false,
    qatBelow: false,
    qat: {
      new: false,
      open: false,
      save: true,
      print: false,
      printPreview: false,
      email: false,
      undo: true,
      redo: true,
    },

    textEditing: false,
    font: { family: 'Calibri', size: 11, bold: false, italic: false, underline: false, strike: false },
    textOpaque: false,

    printPreview: false,
    pageSetup: {
      paper: 'A4',
      landscape: true,
      margins: { left: 12.7, right: 12.7, top: 12.7, bottom: 12.7 },
      centerH: false,
      centerV: false,
      scaleMode: 'fit',
      scalePercent: 100,
      fitW: 1,
      fitH: 1,
    },

    fileName: null,
    dirty: false,
    fileSize: null,
    lastSaved: null,
    docWidth: w,
    docHeight: h,
    units: 'px',
    monochrome: false,

    cursor: null,
    selectionSize: null,
    hasSelection: false,
    hasLiveShape: false,
    canUndo: false,
    canRedo: false,
    recent: [],
    lang: null,
  };
}

/** Preferences remembered between sessions (equivalent to Paint's registry key). */
const PERSISTED: (keyof AppState)[] = [
  'showRulers',
  'showGrid',
  'showStatusBar',
  'ribbonMinimized',
  'qatBelow',
  'qat',
  'font',
  'textOpaque',
  'pencilSize',
  'eraserSize',
  'shapeSize',
  'brushSizes',
  'pageSetup',
  'units',
  'recent',
  'lang',
];
const STORAGE_KEY = 'paintcat:settings:v1';

export function loadSettings(state: AppState): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return state;
    const saved = JSON.parse(raw) as Partial<AppState>;
    const next: AppState = { ...state };
    for (const key of PERSISTED) {
      if (key in saved && saved[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = saved[key];
    }
    next.brushSizes = { ...state.brushSizes, ...next.brushSizes };
    next.qat = { ...state.qat, ...next.qat };
    next.font = { ...state.font, ...next.font };
    if (!isLang(next.lang)) next.lang = null;
    return next;
  } catch {
    return state;
  }
}

export function saveSettings(state: AppState): void {
  try {
    const out: Record<string, unknown> = {};
    for (const key of PERSISTED) out[key] = state[key];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(out));
  } catch {
    // Storage unavailable (private mode): preferences are simply not remembered.
  }
}

/** Document name in the window title and in notices. */
export function docTitle(st: Readonly<AppState>): string {
  return st.fileName ?? t.untitled;
}

export function isPersisted(key: keyof AppState): boolean {
  return PERSISTED.includes(key);
}
