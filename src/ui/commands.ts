import type { App } from '../app/app';
import { rgbToCss } from '../app/color';
import { createCanvas, ctx2d } from '../app/doc';
import { invertCanvas, rotateCanvas, type Rotation } from '../app/imageops';
import { ERASER_SIZES, PENCIL_SIZES, SHAPE_SIZES, type QatItem, type ToolId } from '../app/state';
import { nextZoom } from '../app/viewport';
import { APP_NAME, LANGS, isLang, lang, langName, t, type CommandText } from '../i18n';
import type { ClipboardManager } from '../io/clipboard';
import type { FileManager, SaveFormat } from '../io/files';
import { printCanvas } from '../io/print';
import { BRUSH_SIZES } from '../paint/brushes';
import {
  BRUSH_ORDER,
  SHAPE_ORDER,
  SHAPE_STYLE_ORDER,
  type BrushKind,
  type RGB,
  type ShapeKind,
  type ShapeStyle,
} from '../paint/types';
import type { TextTool } from '../tools/text';
import { shortcutText } from './accel';
import { alertDialog } from './dialog';
import {
  aboutDialog,
  editColorsDialog,
  helpDialog,
  pageSetupDialog,
  propertiesDialog,
  pushCustomColor,
  resizeSkewDialog,
} from './dialogs';
import type { IconName } from './icons';

export interface Command {
  /** Text with & before the access key letter (menus), in the active language. */
  readonly label: string;
  /** Tooltip title (otherwise, the text without & plus the shortcut). */
  readonly tip?: string;
  readonly desc?: string;
  /** Shortcut in the active language as Paint displays it ("Ctrl+Shift+E"). */
  readonly shortcut?: string;
  icon?: IconName;
  enabled?: () => boolean;
  checked?: () => boolean;
  run: () => unknown;
}

export type Commands = Record<string, Command>;

/** Command without text: the text comes from the active language catalog (see `commandText`). */
type CommandDef = Omit<Command, 'label' | 'tip' | 'desc' | 'shortcut'>;

export interface CommandServices {
  files: FileManager;
  clipboard: ClipboardManager;
  showFullscreen(): void;
}

export const BRUSH_ICONS: Record<BrushKind, IconName> = {
  brush: 'brushBrush',
  calligraphy1: 'brushCalligraphy1',
  calligraphy2: 'brushCalligraphy2',
  airbrush: 'brushAirbrush',
  oil: 'brushOil',
  crayon: 'brushCrayon',
  marker: 'brushMarker',
  naturalPencil: 'brushNaturalPencil',
  watercolor: 'brushWatercolor',
};

export const STYLE_ICONS: Record<ShapeStyle, IconName> = {
  none: 'styleNone',
  solid: 'styleSolid',
  crayon: 'styleCrayon',
  marker: 'styleMarker',
  oil: 'styleOil',
  naturalPencil: 'styleNaturalPencil',
  watercolor: 'styleWatercolor',
};

/** Text of a command in the active language; brushes, shapes, styles and QAT buttons are grouped by family. */
export function commandText(id: string): CommandText {
  const [group, kind] = id.split('.');
  if (group === 'brush') return { label: t.brushes[kind as BrushKind] };
  if (group === 'shape' && kind in t.shapes) return { label: t.shapes[kind as ShapeKind] };
  if (group === 'outline') return { label: t.styles[kind as ShapeStyle] };
  if (group === 'fill') return { label: kind === 'none' ? t.noFill : t.styles[kind as ShapeStyle] };
  if (group === 'qat' && kind in t.qat.items) return { label: t.qat.items[kind as QatItem] };
  if (group === 'lang' && isLang(kind)) return { label: langName(kind) };
  return (t.cmd as Readonly<Record<string, CommandText | undefined>>)[id] ?? { label: id };
}

/** Text is read on use, so switching languages does not require recreating the commands. */
function localize(defs: Record<string, CommandDef>): Commands {
  for (const [id, def] of Object.entries(defs)) {
    Object.defineProperties(def, {
      label: { get: () => commandText(id).label, enumerable: true },
      tip: { get: () => commandText(id).tip },
      desc: { get: () => commandText(id).desc },
      shortcut: { get: () => shortcutText(id) },
    });
  }
  return defs as Commands;
}

/** Widths offered by "Size" for the active tool (empty = disabled). */
export function sizeOptions(app: App): readonly number[] {
  const st = app.store.state;
  switch (st.tool) {
    case 'pencil':
      return PENCIL_SIZES;
    case 'eraser':
      return ERASER_SIZES;
    case 'brush':
      return BRUSH_SIZES[st.brush];
    case 'shape':
      return SHAPE_SIZES;
    default:
      return [];
  }
}

export function currentSize(app: App): number {
  const st = app.store.state;
  switch (st.tool) {
    case 'pencil':
      return st.pencilSize;
    case 'eraser':
      return st.eraserSize;
    case 'brush':
      return st.brushSizes[st.brush];
    case 'shape':
      return st.shapeSize;
    default:
      return 0;
  }
}

export function setSize(app: App, size: number): void {
  const st = app.store.state;
  switch (st.tool) {
    case 'pencil':
      return app.store.set({ pencilSize: size });
    case 'eraser':
      return app.store.set({ eraserSize: size });
    case 'brush':
      return app.store.set({ brushSizes: { ...st.brushSizes, [st.brush]: size } });
    case 'shape':
      return app.store.set({ shapeSize: size });
  }
}

/** Ctrl + / Ctrl −: cycles through the tool's 4 widths. */
export function stepSize(app: App, dir: 1 | -1): void {
  const opts = sizeOptions(app);
  if (!opts.length) return;
  const i = opts.indexOf(currentSize(app));
  const next = opts[Math.min(opts.length - 1, Math.max(0, (i < 0 ? 0 : i) + dir))];
  setSize(app, next);
}

/** Applies a color to the active Color 1 or Color 2 (and to the text being edited). */
export function applyColor(app: App, rgb: RGB, which: 1 | 2 = app.store.state.activeColor): void {
  app.store.set(which === 1 ? { color1: rgb } : { color2: rgb });
  if (app.store.state.textEditing) {
    const text = app.tools.text as TextTool;
    if (which === 1) text.applyColor(rgb);
    else text.refreshBackground();
  }
}

export function createCommands(app: App, svc: CommandServices): Commands {
  const st = () => app.store.state;
  const text = () => app.tools.text as TextTool;
  const hasSel = () => st().hasSelection;
  const tool = (id: ToolId) => () => app.setTool(id);
  const isTool = (id: ToolId) => () => st().tool === id;

  const rotate = (op: Rotation) => () => {
    if (app.selection.rect) {
      app.selection.transform((src) => rotateCanvas(src, op));
      app.markDirty();
    } else {
      app.commitLive();
      app.replaceImage(rotateCanvas(app.doc.canvas, op));
    }
  };

  const crop = (): void => {
    const sel = app.selection;
    if (!sel.rect) return;
    const img = sel.getImage();
    if (!img) return;
    const out = createCanvas(img.width, img.height);
    const ctx = ctx2d(out);
    ctx.fillStyle = rgbToCss(st().color2);
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(img, 0, 0);
    // If the selection was floating, the image has an uncommitted hole: replaceImage starts
    // from the last committed state, so undo restores the original image.
    sel.forget();
    app.replaceImage(out);
    app.view.centerOn({ x: 0, y: 0 });
  };

  const invertColor = (): void => {
    if (app.selection.rect) {
      app.selection.transform((src) => invertCanvas(src), false);
      app.markDirty();
    } else {
      app.commitLive();
      app.replaceImage(invertCanvas(app.doc.canvas));
    }
  };

  const saveAs = (f?: SaveFormat) => () => svc.files.saveAs(f);
  const canShare = typeof navigator.share === 'function';

  const cmds: Record<string, CommandDef> = {
    // ------------------------------------------------------------ File
    'file.new': {
      icon: 'new',
      run: () => svc.files.newImage(),
    },
    'file.open': {
      icon: 'open',
      run: () => svc.files.open(),
    },
    'file.save': {
      icon: 'save',
      run: () => svc.files.save(),
    },
    'file.saveAs': {
      icon: 'saveAs',
      run: saveAs(),
    },
    'file.saveAsPng': {
      icon: 'formatPng',
      run: saveAs('png'),
    },
    'file.saveAsJpg': {
      icon: 'formatJpg',
      run: saveAs('jpg'),
    },
    'file.saveAsBmp': {
      icon: 'formatBmp',
      run: saveAs('bmp24'),
    },
    'file.saveAsGif': {
      icon: 'formatGif',
      run: saveAs('gif'),
    },
    'file.saveAsOther': {
      icon: 'formatOther',
      run: saveAs(),
    },
    'file.print': {
      icon: 'print',
      run: () => {
        app.commitLive();
        printCanvas(app.doc.canvas, st().pageSetup);
      },
    },
    'file.pageSetup': {
      icon: 'pageSetup',
      run: () => pageSetupDialog(app),
    },
    'file.printPreview': {
      icon: 'printPreview',
      run: () => {
        app.commitLive();
        app.selection.commit();
        app.store.set({ printPreview: true, tab: 'preview' });
      },
    },
    'file.scanner': {
      icon: 'scanner',
      enabled: () => false,
      run: () => {},
    },
    'file.email': {
      icon: 'email',
      enabled: () => canShare,
      run: async () => {
        app.commitLive();
        const file = await svc.files.currentAsFile();
        if (navigator.canShare?.({ files: [file] })) {
          try {
            await navigator.share({ files: [file], title: file.name });
          } catch {
            /* canceled */
          }
        } else {
          await alertDialog(APP_NAME, t.files.noShare, 'info');
        }
      },
    },
    'file.wallpaper': {
      icon: 'wallpaper',
      enabled: () => false,
      run: () => {},
    },
    'file.wallpaperFill': {
      enabled: () => false,
      run: () => {},
    },
    'file.wallpaperTile': {
      enabled: () => false,
      run: () => {},
    },
    'file.wallpaperCenter': {
      enabled: () => false,
      run: () => {},
    },
    'file.properties': {
      icon: 'properties',
      run: () => propertiesDialog(app),
    },
    'file.about': { icon: 'about', run: () => aboutDialog() },
    'file.exit': {
      icon: 'exit',
      run: async () => {
        if (!(await svc.files.confirmDiscard())) return;
        app.store.set({ dirty: false });
        window.close();
        // If the browser does not allow closing the tab, start a new image.
        setTimeout(() => void svc.files.newImage(), 150);
      },
    },

    // ------------------------------------------------------------ Edit
    'edit.undo': {
      icon: 'undo',
      enabled: () => st().canUndo || st().hasLiveShape || app.selection.isFloating,
      run: () => app.undo(),
    },
    'edit.redo': {
      icon: 'redo',
      enabled: () => st().canRedo,
      run: () => app.redo(),
    },
    'edit.paste': {
      icon: 'paste',
      run: () => (st().textEditing ? text().clipboard('paste') : svc.clipboard.paste()),
    },
    'edit.pasteFrom': {
      icon: 'pasteFrom',
      run: () => svc.clipboard.pasteFrom(),
    },
    'edit.cut': {
      icon: 'cut',
      enabled: () => hasSel() || st().textEditing,
      run: () => (st().textEditing ? text().clipboard('cut') : svc.clipboard.cut()),
    },
    'edit.copy': {
      icon: 'copy',
      enabled: () => hasSel() || st().textEditing,
      run: () => (st().textEditing ? text().clipboard('copy') : svc.clipboard.copy()),
    },
    'edit.selectAll': {
      icon: 'selectAll',
      run: () => {
        app.commitLive();
        app.setTool('select');
        app.selection.selectAll();
      },
    },
    'edit.invertSelection': {
      icon: 'invertSelection',
      enabled: hasSel,
      run: () => app.selection.invert(),
    },
    'edit.delete': {
      icon: 'deleteSelection',
      enabled: hasSel,
      run: () => app.selection.deleteContent(),
    },
    'edit.crop': {
      icon: 'crop',
      enabled: hasSel,
      run: crop,
    },
    'edit.resize': {
      icon: 'resize',
      run: () => resizeSkewDialog(app),
    },
    'edit.rotate': { icon: 'rotate', run: () => {} },
    'edit.rotateRight': { icon: 'rotateRight', run: rotate('right') },
    'edit.rotateLeft': { icon: 'rotateLeft', run: rotate('left') },
    'edit.rotate180': { icon: 'rotate180', run: rotate('180') },
    'edit.flipV': { icon: 'flipVertical', run: rotate('flipV') },
    'edit.flipH': { icon: 'flipHorizontal', run: rotate('flipH') },
    'edit.invertColor': { icon: 'invertColor', run: invertColor },

    // ------------------------------------------------------------ Selection and tools
    'select.main': {
      icon: 'selectRect',
      checked: isTool('select'),
      run: tool('select'),
    },
    'select.rect': {
      icon: 'selectRect',
      checked: () => st().selectMode === 'rect',
      run: () => {
        app.store.set({ selectMode: 'rect' });
        app.setTool('select');
      },
    },
    'select.free': {
      icon: 'selectFree',
      checked: () => st().selectMode === 'free',
      run: () => {
        app.store.set({ selectMode: 'free' });
        app.setTool('select');
      },
    },
    'select.transparent': {
      checked: () => st().transparentSelection,
      run: () => app.store.set({ transparentSelection: !st().transparentSelection }),
    },
    'tool.pencil': {
      icon: 'pencil',
      checked: isTool('pencil'),
      run: tool('pencil'),
    },
    'tool.fill': {
      icon: 'fill',
      checked: isTool('fill'),
      run: tool('fill'),
    },
    'tool.text': {
      icon: 'text',
      checked: isTool('text'),
      run: tool('text'),
    },
    'tool.eraser': {
      icon: 'eraser',
      checked: isTool('eraser'),
      run: tool('eraser'),
    },
    'tool.picker': {
      icon: 'colorPicker',
      checked: isTool('picker'),
      run: tool('picker'),
    },
    'tool.magnifier': {
      icon: 'magnifier',
      checked: isTool('magnifier'),
      run: tool('magnifier'),
    },
    'tool.brush': {
      icon: 'brushBrush',
      checked: isTool('brush'),
      run: tool('brush'),
    },
    'shape.outline': {
      icon: 'outline',
      enabled: isTool('shape'),
      run: () => {},
    },
    'shape.fill': {
      icon: 'fillStyle',
      enabled: () => st().tool === 'shape' && st().shape !== 'line' && st().shape !== 'curve',
      run: () => {},
    },
    size: {
      icon: 'sizeLines',
      enabled: () => sizeOptions(app).length > 0,
      run: () => {},
    },

    // ------------------------------------------------------------ Colors
    'color.1': {
      checked: () => st().activeColor === 1,
      run: () => app.store.set({ activeColor: 1 }),
    },
    'color.2': {
      checked: () => st().activeColor === 2,
      run: () => app.store.set({ activeColor: 2 }),
    },
    'color.edit': {
      icon: 'editColors',
      run: async () => {
        const which = st().activeColor;
        const rgb = await editColorsDialog(which === 1 ? st().color1 : st().color2);
        if (!rgb) return;
        applyColor(app, rgb, which);
        app.store.set({ customColors: pushCustomColor(st().customColors, rgb) });
      },
    },

    // ------------------------------------------------------------ View
    'view.zoomIn': {
      icon: 'zoomIn',
      enabled: () => st().zoom < 8,
      run: () => app.view.setZoom(nextZoom(st().zoom, 1)),
    },
    'view.zoomOut': {
      icon: 'zoomOut',
      enabled: () => st().zoom > 0.125,
      run: () => app.view.setZoom(nextZoom(st().zoom, -1)),
    },
    'view.zoom100': { icon: 'zoom100', run: () => app.view.setZoom(1) },
    'view.rulers': {
      checked: () => st().showRulers,
      run: () => app.store.set({ showRulers: !st().showRulers }),
    },
    'view.grid': {
      checked: () => st().showGrid,
      run: () => app.store.set({ showGrid: !st().showGrid }),
    },
    'view.statusBar': {
      checked: () => st().showStatusBar,
      run: () => app.store.set({ showStatusBar: !st().showStatusBar }),
    },
    'view.fullscreen': {
      icon: 'fullscreen',
      run: () => svc.showFullscreen(),
    },
    'view.thumbnail': {
      icon: 'thumbnail',
      enabled: () => {
        const { w, h } = app.view.size;
        return st().showThumbnail || app.doc.width * st().zoom > w || app.doc.height * st().zoom > h;
      },
      checked: () => st().showThumbnail,
      run: () => app.store.set({ showThumbnail: !st().showThumbnail }),
    },

    // ------------------------------------------------------------ Text
    'text.family': { run: () => {} },
    'text.size': { run: () => {} },
    'text.bold': {
      icon: 'bold',
      checked: () => st().font.bold,
      run: () => text().toggle('bold'),
    },
    'text.italic': {
      icon: 'italic',
      checked: () => st().font.italic,
      run: () => text().toggle('italic'),
    },
    'text.underline': {
      icon: 'underline',
      checked: () => st().font.underline,
      run: () => text().toggle('underline'),
    },
    'text.strike': {
      icon: 'strikethrough',
      checked: () => st().font.strike,
      run: () => text().toggle('strike'),
    },
    'text.opaque': {
      icon: 'opaque',
      checked: () => st().textOpaque,
      run: () => {
        app.store.set({ textOpaque: true });
        text().refreshBackground();
      },
    },
    'text.transparent': {
      icon: 'transparent',
      checked: () => !st().textOpaque,
      run: () => {
        app.store.set({ textOpaque: false });
        text().refreshBackground();
      },
    },

    // ------------------------------------------------------------ Print preview
    'preview.print': {
      icon: 'print',
      run: () => printCanvas(app.doc.canvas, st().pageSetup),
    },
    'preview.pageSetup': {
      icon: 'pageSetup',
      run: () => pageSetupDialog(app),
    },
    'preview.zoomIn': { icon: 'zoomIn', run: () => {} },
    'preview.zoomOut': { icon: 'zoomOut', run: () => {} },
    'preview.onePage': {
      icon: 'onePage',
      run: () => {},
    },
    'preview.twoPages': {
      icon: 'twoPages',
      run: () => {},
    },
    'preview.prev': {
      icon: 'prevPage',
      run: () => {},
    },
    'preview.next': {
      icon: 'nextPage',
      run: () => {},
    },
    'preview.close': {
      icon: 'closePreview',
      run: () => app.store.set({ printPreview: false, tab: 'home' }),
    },

    // ------------------------------------------------------------ Ribbon and Quick Access Toolbar
    'ribbon.minimize': {
      checked: () => st().ribbonMinimized,
      run: () => app.store.set({ ribbonMinimized: !st().ribbonMinimized, ribbonPopup: false }),
    },
    'qat.position': {
      run: () => app.store.set({ qatBelow: !st().qatBelow }),
    },
    help: {
      icon: 'help',
      run: () => helpDialog(),
    },
    // The language button opens its own menu; the command only provides the tooltip text.
    language: { icon: 'language', run: () => {} },
  };

  for (const kind of BRUSH_ORDER) {
    cmds[`brush.${kind}`] = {
      icon: BRUSH_ICONS[kind],
      checked: () => st().brush === kind,
      run: () => {
        app.store.set({ brush: kind });
        app.setTool('brush');
        app.view.refreshCursor();
      },
    };
  }
  for (const kind of SHAPE_ORDER) {
    cmds[`shape.${kind}`] = {
      checked: () => st().tool === 'shape' && st().shape === kind,
      run: () => {
        app.store.set({ shape: kind });
        app.setTool('shape');
      },
    };
  }
  for (const style of SHAPE_STYLE_ORDER) {
    cmds[`outline.${style}`] = {
      icon: STYLE_ICONS[style],
      checked: () => st().outline === style,
      run: () => app.store.set({ outline: style }),
    };
    cmds[`fill.${style}`] = {
      icon: STYLE_ICONS[style],
      checked: () => st().fill === style,
      run: () => app.store.set({ fill: style }),
    };
  }
  for (const item of Object.keys(t.qat.items) as QatItem[]) {
    cmds[`qat.${item}`] = {
      checked: () => st().qat[item],
      run: () => app.store.set({ qat: { ...st().qat, [item]: !st().qat[item] } }),
    };
  }
  for (const l of LANGS) {
    cmds[`lang.${l}`] = { checked: () => lang === l, run: () => app.store.set({ lang: l }) };
  }
  return localize(cmds);
}
