import type { App } from '../app/app';
import { WHITE, rgbToCss } from '../app/color';
import { createCanvas, ctx2d } from '../app/doc';
import { decodeImage, pickImageFile } from './files';

/**
 * Clipboard: copies to the system clipboard as PNG (if the browser allows it) and also keeps an
 * internal copy so pasting works even if read permission is denied.
 */
export class ClipboardManager {
  private internal: HTMLCanvasElement | null = null;

  constructor(private readonly app: App) {
    // Ctrl+V / ⌘V: the "paste" event gives access to the image without asking for permissions.
    document.addEventListener('paste', (e) => {
      if (isEditable(e.target)) return;
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.kind === 'file' && item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) {
            e.preventDefault();
            void decodeImage(blob).then((c) => this.pasteCanvas(c));
            return;
          }
        }
      }
      if (this.internal) {
        e.preventDefault();
        this.pasteCanvas(this.internal);
      }
    });
  }

  get hasInternal(): boolean {
    return this.internal !== null;
  }

  async copy(): Promise<void> {
    const img = this.app.selection.getImage();
    if (!img) return;
    this.internal = img;
    try {
      const blob = new Promise<Blob>((resolve, reject) =>
        flatten(img).toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'),
      );
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      // No write permission: the internal copy remains.
    }
  }

  async cut(): Promise<void> {
    await this.copy();
    this.app.selection.deleteContent();
  }

  /** Paste from the ribbon button or the context menu. */
  async paste(): Promise<void> {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) {
          const canvas = await decodeImage(await item.getType(type));
          this.pasteCanvas(canvas);
          return;
        }
      }
    } catch {
      // Permission denied or API unavailable: use the internal copy.
    }
    if (this.internal) this.pasteCanvas(this.internal);
  }

  async pasteFrom(): Promise<void> {
    const picked = await pickImageFile();
    if (!picked) return;
    this.pasteCanvas(await decodeImage(picked.file, picked.file.name));
  }

  /** Pastes as a floating selection in the visible corner; enlarges the canvas if the image does not fit. */
  pasteCanvas(src: HTMLCanvasElement): void {
    const app = this.app;
    app.commitLive();
    app.setTool('select');
    app.selection.commit();
    const { doc } = app;
    if (src.width > doc.width || src.height > doc.height) {
      app.resizeCanvas(Math.max(doc.width, src.width), Math.max(doc.height, src.height));
    }
    const vis = app.view.visibleRect();
    const x = Math.max(0, Math.min(Math.floor(vis.x), doc.width - src.width));
    const y = Math.max(0, Math.min(Math.floor(vis.y), doc.height - src.height));
    const copy = createCanvas(src.width, src.height);
    ctx2d(copy).drawImage(src, 0, 0);
    app.selection.pasteImage(copy, { x, y });
    app.markDirty();
  }
}

function flatten(img: HTMLCanvasElement): HTMLCanvasElement {
  const c = createCanvas(img.width, img.height);
  const ctx = ctx2d(c);
  ctx.fillStyle = rgbToCss(WHITE);
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0);
  return c;
}

export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}
