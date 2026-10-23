/** Common fonts on Windows, macOS and Linux; only installed ones are shown. */
const CANDIDATES = [
  'Agency FB', 'American Typewriter', 'Andale Mono', 'Arial', 'Arial Black', 'Arial Narrow', 'Arial Rounded MT Bold',
  'Avenir', 'Avenir Next', 'Bahnschrift', 'Baskerville', 'Bodoni 72', 'Book Antiqua', 'Bookman Old Style', 'Bradley Hand',
  'Brush Script MT', 'Calibri', 'Cambria', 'Candara', 'Carlito', 'Century Gothic', 'Chalkboard', 'Chalkduster', 'Charter',
  'Comic Sans MS', 'Consolas', 'Constantia', 'Cooper Black', 'Copperplate', 'Corbel', 'Courier', 'Courier New', 'DejaVu Sans',
  'DejaVu Serif', 'Didot', 'Ebrima', 'Franklin Gothic Medium', 'Futura', 'Gabriola', 'Garamond', 'Geneva', 'Georgia', 'Gill Sans',
  'Helvetica', 'Helvetica Neue', 'Herculanum', 'Hoefler Text', 'Impact', 'Ink Free', 'Javanese Text', 'Leelawadee UI',
  'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Lucida Console', 'Lucida Grande', 'Lucida Sans Unicode', 'Luminari',
  'Malgun Gothic', 'Marker Felt', 'Menlo', 'Microsoft Sans Serif', 'MingLiU-ExtB', 'Monaco', 'MS Gothic', 'MV Boli', 'Myanmar Text',
  'Nirmala UI', 'Noteworthy', 'Noto Sans', 'Noto Serif', 'Optima', 'Palatino', 'Palatino Linotype', 'Papyrus', 'Phosphate',
  'Rockwell', 'Segoe Print', 'Segoe Script', 'Segoe UI', 'Segoe UI Emoji', 'Segoe UI Symbol', 'SF Pro', 'SimSun', 'Sitka Text',
  'Skia', 'Snell Roundhand', 'Sylfaen', 'Symbol', 'Tahoma', 'Times', 'Times New Roman', 'Trattatello', 'Trebuchet MS',
  'Ubuntu', 'Verdana', 'Webdings', 'Wingdings', 'Yu Gothic', 'Zapfino',
]; // prettier-ignore

let cache: string[] | null = null;
let extra: string[] = [];

function isInstalled(ctx: CanvasRenderingContext2D, family: string): boolean {
  const sample = 'mmmmmmmmmmlliWWQ@#0123456789';
  for (const base of ['monospace', 'serif', 'sans-serif']) {
    ctx.font = `72px ${base}`;
    const w0 = ctx.measureText(sample).width;
    ctx.font = `72px "${family}", ${base}`;
    if (ctx.measureText(sample).width !== w0) return true;
  }
  return false;
}

export function availableFonts(): string[] {
  if (!cache) {
    const ctx = document.createElement('canvas').getContext('2d');
    cache = ctx ? CANDIDATES.filter((f) => isInstalled(ctx, f)) : ['Arial', 'Calibri', 'Times New Roman'];
    if (!cache.includes('Calibri')) cache.push('Calibri');
  }
  return [...new Set([...cache, ...extra])].toSorted((a, b) => a.localeCompare(b, 'es'));
}

/** "Show more fonts": in Chrome/Edge, asks for permission to list all installed fonts. */
export async function loadMoreFonts(): Promise<string[]> {
  const q = (window as unknown as { queryLocalFonts?: () => Promise<{ family: string }[]> }).queryLocalFonts;
  if (q) {
    try {
      const fonts = await q();
      extra = [...new Set(fonts.map((f) => f.family))];
    } catch {
      /* permission denied */
    }
  }
  return availableFonts();
}
