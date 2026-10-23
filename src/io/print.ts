import type { PageSetup } from '../app/state';

/** Paper sizes in millimeters (width × height in portrait). */
export const PAPER_MM: Record<PageSetup['paper'], [number, number]> = {
  A4: [210, 297],
  A3: [297, 420],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};

const PX_TO_MM = 25.4 / 96;

export interface PageLayout {
  pageW: number;
  pageH: number;
  printableW: number;
  printableH: number;
  /** Size of the printed image (mm). */
  imageW: number;
  imageH: number;
  /** Offset of the image within the printable area of the first page (mm). */
  offsetX: number;
  offsetY: number;
  cols: number;
  rows: number;
}

export function pageLayout(s: PageSetup, imgW: number, imgH: number): PageLayout {
  const [pw, ph] = PAPER_MM[s.paper];
  const pageW = s.landscape ? ph : pw;
  const pageH = s.landscape ? pw : ph;
  const printableW = Math.max(10, pageW - s.margins.left - s.margins.right);
  const printableH = Math.max(10, pageH - s.margins.top - s.margins.bottom);
  let scale: number;
  if (s.scaleMode === 'fit') {
    scale = Math.min((s.fitW * printableW) / (imgW * PX_TO_MM), (s.fitH * printableH) / (imgH * PX_TO_MM));
  } else {
    scale = Math.max(0.1, s.scalePercent / 100);
  }
  const imageW = imgW * PX_TO_MM * scale;
  const imageH = imgH * PX_TO_MM * scale;
  const cols = Math.max(1, Math.ceil(imageW / printableW - 1e-6));
  const rows = Math.max(1, Math.ceil(imageH / printableH - 1e-6));
  const offsetX = s.centerH && cols === 1 ? (printableW - imageW) / 2 : 0;
  const offsetY = s.centerV && rows === 1 ? (printableH - imageH) / 2 : 0;
  return { pageW, pageH, printableW, printableH, imageW, imageH, offsetX, offsetY, cols, rows };
}

/** Builds the sheets (one per page) with the image cropped on each. Units: mm. */
export function buildPages(layout: PageLayout, src: string, unit: (mm: number) => string): HTMLElement[] {
  const pages: HTMLElement[] = [];
  for (let r = 0; r < layout.rows; r++) {
    for (let c = 0; c < layout.cols; c++) {
      const page = document.createElement('div');
      page.className = 'print-page';
      page.style.width = unit(layout.printableW);
      page.style.height = unit(layout.printableH);
      const img = document.createElement('img');
      img.src = src;
      img.alt = '';
      img.style.width = unit(layout.imageW);
      img.style.height = unit(layout.imageH);
      img.style.left = unit(layout.offsetX - c * layout.printableW);
      img.style.top = unit(layout.offsetY - r * layout.printableH);
      page.append(img);
      pages.push(page);
    }
  }
  return pages;
}

/** Prints the image with the page setup (margins, orientation, scaling). */
export function printCanvas(canvas: HTMLCanvasElement, setup: PageSetup): void {
  const layout = pageLayout(setup, canvas.width, canvas.height);
  const src = canvas.toDataURL('image/png');
  const root = document.createElement('div');
  root.className = 'print-root';
  root.append(...buildPages(layout, src, (mm) => `${mm}mm`));
  const style = document.createElement('style');
  style.textContent = `@page { size: ${layout.pageW}mm ${layout.pageH}mm; margin: ${setup.margins.top}mm ${setup.margins.right}mm ${setup.margins.bottom}mm ${setup.margins.left}mm; }`;
  document.head.append(style);
  document.body.append(root);
  const cleanup = (): void => {
    root.remove();
    style.remove();
    window.removeEventListener('afterprint', cleanup);
  };
  window.addEventListener('afterprint', cleanup);
  // Gives the image time to decode before opening the print dialog.
  const img = root.querySelector('img');
  const go = (): void => {
    window.print();
    setTimeout(cleanup, 1000);
  };
  if (img && !img.complete) img.addEventListener('load', go, { once: true });
  else go();
}
