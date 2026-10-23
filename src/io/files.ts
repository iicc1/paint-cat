import type { App } from '../app/app';
import { WHITE } from '../app/color';
import { createCanvas, ctx2d } from '../app/doc';
import { flattenOnto } from '../app/imageops';
import { defaultImageSize, docTitle, type RecentEntry } from '../app/state';
import { APP_NAME, t } from '../i18n';
import { alertDialog, confirmSaveDialog } from '../ui/dialog';
import { saveAsDialog } from '../ui/dialogs';
import { decodeBMP, encodeBMP, encodeGIF, encodeTIFF } from './codecs';
import { deleteRecent, getRecent, putRecent } from './recent';

export type SaveFormat = 'png' | 'jpg' | 'bmp24' | 'bmp8' | 'bmp4' | 'bmp1' | 'gif' | 'tiff';

export interface FormatInfo {
  id: SaveFormat;
  mime: string;
  ext: string;
  exts: string[];
}

/** File types of Paint's "Save as" dialog (in the same order; HEIC cannot be generated in the browser). Names in `t.files.formats`. */
export const SAVE_FORMATS: readonly FormatInfo[] = [
  {
    id: 'bmp1',
    mime: 'image/bmp',
    ext: 'bmp',
    exts: ['.bmp', '.dib'],
  },
  {
    id: 'bmp4',
    mime: 'image/bmp',
    ext: 'bmp',
    exts: ['.bmp', '.dib'],
  },
  {
    id: 'bmp8',
    mime: 'image/bmp',
    ext: 'bmp',
    exts: ['.bmp', '.dib'],
  },
  {
    id: 'bmp24',
    mime: 'image/bmp',
    ext: 'bmp',
    exts: ['.bmp', '.dib'],
  },
  {
    id: 'jpg',
    mime: 'image/jpeg',
    ext: 'jpg',
    exts: ['.jpg', '.jpeg', '.jpe', '.jfif'],
  },
  { id: 'gif', mime: 'image/gif', ext: 'gif', exts: ['.gif'] },
  { id: 'tiff', mime: 'image/tiff', ext: 'tif', exts: ['.tif', '.tiff'] },
  { id: 'png', mime: 'image/png', ext: 'png', exts: ['.png'] },
];

export const OPEN_ACCEPT: Record<string, string[]> = {
  'image/png': ['.png'],
  'image/jpeg': ['.jpg', '.jpeg', '.jpe', '.jfif'],
  'image/bmp': ['.bmp', '.dib'],
  'image/gif': ['.gif'],
  'image/tiff': ['.tif', '.tiff'],
  'image/webp': ['.webp'],
  'image/x-icon': ['.ico'],
  'image/heic': ['.heic'],
};

function formatInfo(id: SaveFormat): FormatInfo {
  return SAVE_FORMATS.find((f) => f.id === id) ?? SAVE_FORMATS[SAVE_FORMATS.length - 1];
}

export function formatFromName(name: string, fallback: SaveFormat = 'png'): SaveFormat {
  const ext = name.toLowerCase().match(/\.[a-z0-9]+$/)?.[0] ?? '';
  if (ext === '.png') return 'png';
  if (['.jpg', '.jpeg', '.jpe', '.jfif'].includes(ext)) return 'jpg';
  if (['.bmp', '.dib'].includes(ext)) return fallback.startsWith('bmp') ? fallback : 'bmp24';
  if (ext === '.gif') return 'gif';
  if (['.tif', '.tiff'].includes(ext)) return 'tiff';
  return fallback;
}

function baseName(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export async function encodeImage(canvas: HTMLCanvasElement, format: SaveFormat): Promise<Blob> {
  const info = formatInfo(format);
  if (format === 'png' || format === 'jpg') {
    return new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('Could not encode the image'))),
        info.mime,
        format === 'jpg' ? 0.9 : undefined,
      ),
    );
  }
  const img = ctx2d(canvas, true).getImageData(0, 0, canvas.width, canvas.height);
  let bytes: Uint8Array<ArrayBuffer>;
  if (format === 'gif') bytes = encodeGIF(img);
  else if (format === 'tiff') bytes = encodeTIFF(img);
  else bytes = encodeBMP(img, format === 'bmp1' ? 1 : format === 'bmp4' ? 4 : format === 'bmp8' ? 8 : 24);
  return new Blob([bytes], { type: info.mime });
}

/** Decodes an image file to an opaque canvas (transparency shows as white, as in Paint). */
export async function decodeImage(file: Blob, name = ''): Promise<HTMLCanvasElement> {
  try {
    const bmp = await createImageBitmap(file);
    const c = flattenOnto(bmp, bmp.width, bmp.height, WHITE);
    bmp.close();
    return c;
  } catch (err) {
    if (/\.(bmp|dib)$/i.test(name) || file.type === 'image/bmp') {
      const d = decodeBMP(new Uint8Array(await file.arrayBuffer()));
      const tmp = createCanvas(d.width, d.height);
      ctx2d(tmp).putImageData(new ImageData(d.data, d.width, d.height), 0, 0);
      return flattenOnto(tmp, d.width, d.height, WHITE);
    }
    throw err;
  }
}

/** Document file management: new, open, save, recent. */
export class FileManager {
  private handle: FileSystemFileHandle | null = null;
  private format: SaveFormat = 'png';
  private recentId: string | null = null;

  constructor(private readonly app: App) {
    // Open files with the installed PWA (manifest file_handlers).
    const lq = (
      window as unknown as { launchQueue?: { setConsumer(fn: (p: { files: FileSystemFileHandle[] }) => void): void } }
    ).launchQueue;
    lq?.setConsumer(async (params) => {
      const h = params.files[0];
      if (h) await this.openFile(await h.getFile(), h);
    });
  }

  /** Asks about unsaved changes. Returns false if the user cancels. */
  async confirmDiscard(): Promise<boolean> {
    if (!this.app.store.state.dirty) return true;
    const answer = await confirmSaveDialog(docTitle(this.app.store.state));
    if (answer === null) return false;
    if (answer === 'discard') return true;
    return this.save();
  }

  async newImage(): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    this.app.commitLive();
    this.app.tool.cancelLive?.();
    this.app.selection.cancel();
    const { w, h } = defaultImageSize();
    const c = createCanvas(w, h);
    const ctx = ctx2d(c);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
    this.app.doc.reset(c);
    this.handle = null;
    this.format = 'png';
    this.recentId = null;
    this.app.store.set({ fileName: null, dirty: false, fileSize: null, lastSaved: null, zoom: 1 });
    this.app.view.layout();
  }

  async open(): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const picked = await pickImageFile();
    if (picked) await this.openFile(picked.file, picked.handle);
  }

  async openFile(file: File, handle?: FileSystemFileHandle | null): Promise<void> {
    let canvas: HTMLCanvasElement;
    try {
      canvas = await decodeImage(file, file.name);
    } catch {
      await alertDialog(APP_NAME, t.files.cantRead(file.name), 'error');
      return;
    }
    this.app.tool.cancelLive?.();
    this.app.selection.cancel();
    this.app.doc.reset(canvas);
    this.handle = handle ?? null;
    this.format = formatFromName(file.name);
    this.app.store.set({
      fileName: file.name,
      dirty: false,
      fileSize: file.size,
      lastSaved: file.lastModified || null,
      zoom: 1,
    });
    this.app.view.layout();
    this.app.view.centerOn({ x: 0, y: 0 });
    await this.remember(file.name, file, handle ?? undefined);
  }

  async openRecent(entry: RecentEntry): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const rec = await getRecent(entry.id);
    let file: File | null = null;
    if (rec?.handle) {
      try {
        const h = rec.handle as FileSystemFileHandle & { requestPermission?: (o: object) => Promise<PermissionState> };
        if ((await h.requestPermission?.({ mode: 'read' })) !== 'denied') file = await h.getFile();
      } catch {
        file = null;
      }
    }
    if (!file && rec?.blob) file = new File([rec.blob], rec.name, { type: rec.blob.type });
    if (!file) {
      await alertDialog(APP_NAME, t.files.notFound(entry.name), 'warning');
      await deleteRecent(entry.id);
      this.app.store.set({ recent: this.app.store.state.recent.filter((r) => r.id !== entry.id) });
      return;
    }
    await this.openFile(file, rec?.handle ?? null);
  }

  /** Save: overwrites the file if there is one; otherwise, Save as. Returns false if canceled. */
  async save(): Promise<boolean> {
    this.app.commitLive();
    if (this.handle && 'createWritable' in this.handle) {
      try {
        const blob = await encodeImage(this.app.doc.canvas, this.format);
        await writeHandle(this.handle, blob);
        this.saved(this.handle.name, blob);
        return true;
      } catch {
        // Permission denied or file locked: ask for another destination.
      }
    }
    return this.saveAs(this.app.store.state.fileName ? this.format : undefined);
  }

  async saveAs(format?: SaveFormat): Promise<boolean> {
    this.app.commitLive();
    const st = this.app.store.state;
    const initial = format ?? (st.fileName ? this.format : 'png');
    const name = `${baseName(docTitle(st))}.${formatInfo(initial).ext}`;
    const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> })
      .showSaveFilePicker;
    if (picker) {
      const ordered = [formatInfo(initial), ...SAVE_FORMATS.filter((f) => f.id !== initial)];
      let handle: FileSystemFileHandle;
      try {
        handle = await picker({
          suggestedName: name,
          id: 'paintcat-save',
          startIn: 'pictures',
          types: ordered.map((f) => ({ description: t.files.formats[f.id], accept: { [f.mime]: f.exts } })),
          excludeAcceptAllOption: true,
        });
      } catch {
        return false; // Canceled
      }
      const fmt = formatFromName(handle.name, initial);
      const blob = await encodeImage(this.app.doc.canvas, fmt);
      await writeHandle(handle, blob);
      this.handle = handle;
      this.format = fmt;
      this.saved(handle.name, blob);
      return true;
    }
    // Browsers without File System Access (Safari, Firefox): custom dialog and download.
    const choice = await saveAsDialog(baseName(name), initial);
    if (!choice) return false;
    const info = formatInfo(choice.format);
    const fileName = /\.[a-z0-9]+$/i.test(choice.name) ? choice.name : `${choice.name}.${info.ext}`;
    const blob = await encodeImage(this.app.doc.canvas, choice.format);
    download(blob, fileName);
    this.format = choice.format;
    this.saved(fileName, blob);
    return true;
  }

  /** Copy of the canvas as a PNG file (to share by email, etc.). */
  async currentAsFile(): Promise<File> {
    const name = `${baseName(docTitle(this.app.store.state))}.png`;
    const blob = await encodeImage(this.app.doc.canvas, 'png');
    return new File([blob], name, { type: 'image/png' });
  }

  private saved(name: string, blob: Blob): void {
    this.app.store.set({ fileName: name, dirty: false, fileSize: blob.size, lastSaved: Date.now() });
    void this.remember(name, blob, this.handle ?? undefined);
  }

  private async remember(name: string, blob: Blob, handle?: FileSystemFileHandle): Promise<void> {
    const recent = this.app.store.state.recent;
    const existing = recent.find((r) => r.name === name);
    const id =
      this.recentId && recent.some((r) => r.id === this.recentId && r.name === name)
        ? this.recentId
        : (existing?.id ?? crypto.randomUUID());
    this.recentId = id;
    await putRecent({ id, name, blob, handle });
    const next = [{ id, name }, ...recent.filter((r) => r.id !== id && r.name !== name)];
    for (const old of next.slice(9)) void deleteRecent(old.id);
    this.app.store.set({ recent: next.slice(0, 9) });
  }
}

async function writeHandle(handle: FileSystemFileHandle, blob: Blob): Promise<void> {
  const w = await handle.createWritable();
  await w.write(blob);
  await w.close();
}

export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

/** Image file picker: File System Access if available, otherwise an <input type=file>. */
export async function pickImageFile(): Promise<{ file: File; handle: FileSystemFileHandle | null } | null> {
  const picker = (window as unknown as { showOpenFilePicker?: (o: object) => Promise<FileSystemFileHandle[]> })
    .showOpenFilePicker;
  if (picker) {
    try {
      const [handle] = await picker({
        id: 'paintcat-open',
        startIn: 'pictures',
        types: [{ description: t.files.allImages, accept: OPEN_ACCEPT }],
        multiple: false,
      });
      return { file: await handle.getFile(), handle };
    } catch {
      return null;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = Object.values(OPEN_ACCEPT).flat().join(',') + ',image/*';
    input.addEventListener('change', () => resolve(input.files?.[0] ? { file: input.files[0], handle: null } : null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
