import { describe, expect, it } from 'vitest';
import { decodeBMP, encodeBMP, encodeGIF, encodeTIFF } from './codecs';
import type { BmpDepth, RasterImage } from './codecs';

type Color = readonly [r: number, g: number, b: number];

const VGA: readonly Color[] = [
  [0, 0, 0],
  [128, 0, 0],
  [0, 128, 0],
  [128, 128, 0],
  [0, 0, 128],
  [128, 0, 128],
  [0, 128, 128],
  [192, 192, 192],
  [128, 128, 128],
  [255, 0, 0],
  [0, 255, 0],
  [255, 255, 0],
  [0, 0, 255],
  [255, 0, 255],
  [0, 255, 255],
  [255, 255, 255],
];
const BLACK: Color = [0, 0, 0];
const WHITE: Color = [255, 255, 255];

/** Opaque image (or with the given alpha) with one color per pixel, top-down. */
function image(width: number, height: number, colors: readonly Color[], alpha = 255): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = colors[i % colors.length];
    data.set([r, g, b, alpha], i * 4);
  }
  return { width, height, data };
}

/** [r, g, b] colors of each pixel; also checks that all are opaque. */
function colorsOf(img: { data: Uint8ClampedArray }): Color[] {
  const out: Color[] = [];
  for (let i = 0; i < img.data.length; i += 4) {
    expect(img.data[i + 3]).toBe(255);
    out.push([img.data[i], img.data[i + 1], img.data[i + 2]]);
  }
  return out;
}

/** Arbitrary (deterministic) colors to test 24 bits. */
function arbitraryColors(n: number): Color[] {
  return Array.from({ length: n }, (_, i): Color => [(i * 53 + 7) & 255, (i * 97 + 31) & 255, (i * 151 + 200) & 255]);
}

function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(start, start + length));
}

function bmpHeader(bytes: Uint8Array) {
  const v = view(bytes);
  return {
    signature: ascii(bytes, 0, 2),
    fileSize: v.getUint32(2, true),
    reserved: v.getUint32(6, true),
    pixelOffset: v.getUint32(10, true),
    headerSize: v.getUint32(14, true),
    width: v.getInt32(18, true),
    height: v.getInt32(22, true),
    planes: v.getUint16(26, true),
    bitsPerPixel: v.getUint16(28, true),
    compression: v.getUint32(30, true),
    imageSize: v.getUint32(34, true),
    xPixelsPerMeter: v.getInt32(38, true),
    yPixelsPerMeter: v.getInt32(42, true),
    colorsUsed: v.getUint32(46, true),
    colorsImportant: v.getUint32(50, true),
  };
}

function rowSize(width: number, depth: number): number {
  return Math.ceil((width * depth) / 32) * 4;
}

/** What is checked of a BMP's structure: header, actual length and row padding bytes. */
function bmpLayout(bytes: Uint8Array) {
  const header = bmpHeader(bytes);
  const used = Math.ceil((header.width * header.bitsPerPixel) / 8);
  const stride = rowSize(header.width, header.bitsPerPixel);
  const padding: number[] = [];
  for (let row = 0; row < Math.abs(header.height); row++) {
    const start = header.pixelOffset + row * stride;
    padding.push(...bytes.subarray(start + used, start + stride));
  }
  return { header, length: bytes.length, padding };
}

/** Expected bmpLayout: bottom-up rows zero-padded to 4 bytes, 72 DPI, full palette. */
function expectedBmpLayout(width: number, height: number, depth: BmpDepth): ReturnType<typeof bmpLayout> {
  const paletteEntries = depth === 24 ? 0 : 2 ** depth;
  const pixelOffset = 14 + 40 + paletteEntries * 4;
  const stride = rowSize(width, depth);
  const imageSize = stride * height;
  const paddingPerRow = stride - Math.ceil((width * depth) / 8);
  return {
    header: {
      signature: 'BM',
      fileSize: pixelOffset + imageSize,
      reserved: 0,
      pixelOffset,
      headerSize: 40,
      width,
      height, // positive: bottom-up
      planes: 1,
      bitsPerPixel: depth,
      compression: 0,
      imageSize,
      xPixelsPerMeter: 2835,
      yPixelsPerMeter: 2835,
      colorsUsed: paletteEntries,
      colorsImportant: 0,
    },
    length: pixelOffset + imageSize,
    padding: Array.from({ length: paddingPerRow * height }, () => 0),
  };
}

/** BMP palette entries as RGB colors. */
function bmpPalette(bytes: Uint8Array): Color[] {
  const { colorsUsed } = bmpHeader(bytes);
  return Array.from({ length: colorsUsed }, (_, i): Color => {
    const o = 54 + i * 4;
    expect(bytes[o + 3]).toBe(0);
    return [bytes[o + 2], bytes[o + 1], bytes[o]];
  });
}

describe('encodeBMP 24-bit', () => {
  it('writes the BITMAPINFOHEADER header and pads rows to 4 bytes', () => {
    expect(bmpLayout(encodeBMP(image(3, 2, arbitraryColors(6)), 24))).toEqual(expectedBmpLayout(3, 2, 24));
    expect(bmpLayout(encodeBMP(image(5, 3, arbitraryColors(15)), 24))).toEqual(expectedBmpLayout(5, 3, 24));
    expect(bmpLayout(encodeBMP(image(4, 1, arbitraryColors(4)), 24))).toEqual(expectedBmpLayout(4, 1, 24));
  });

  it('stores rows bottom-up in BGR order', () => {
    const colors = arbitraryColors(6);
    const bytes = encodeBMP(image(3, 2, colors), 24);
    const [r, g, b] = colors[3]; // first pixel of the bottom row
    expect(Array.from(bytes.subarray(54, 57))).toEqual([b, g, r]);
    const [r2, g2, b2] = colors[0]; // first pixel of the top row
    expect(Array.from(bytes.subarray(54 + 12, 54 + 15))).toEqual([b2, g2, r2]);
  });

  it.each([
    [3, 2],
    [5, 3],
    [1, 1],
    [7, 4],
  ])('exact round trip at %i×%i', (width, height) => {
    const colors = arbitraryColors(width * height);
    const decoded = decodeBMP(encodeBMP(image(width, height, colors), 24));
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(colorsOf(decoded)).toEqual(colors);
  });

  it('fully transparent pixels become white and the rest ignore alpha', () => {
    const img = image(2, 1, [[10, 20, 30]]);
    img.data[3] = 0;
    img.data[7] = 128;
    expect(colorsOf(decodeBMP(encodeBMP(img, 24)))).toEqual([WHITE, [10, 20, 30]]);
  });
});

describe('encodeBMP 8-bit', () => {
  it('writes the header with a 256-entry palette', () => {
    const bytes = encodeBMP(image(5, 3, arbitraryColors(15)), 8);
    expect(bmpLayout(bytes)).toEqual(expectedBmpLayout(5, 3, 8));
    expect(bmpHeader(bytes).pixelOffset).toBe(14 + 40 + 1024);
  });

  it.each([
    [3, 2],
    [5, 3],
  ])('exact round trip at %i×%i with nearly identical colors', (width, height) => {
    // Colors that fall in the same rgb565 cell: they must stay distinct.
    const colors: Color[] = [
      [0, 0, 0],
      [1, 1, 1],
      [1, 0, 0],
      [0, 0, 1],
      [255, 255, 255],
      [254, 255, 255],
      [100, 150, 200],
      [101, 150, 200],
    ];
    const decoded = decodeBMP(encodeBMP(image(width, height, colors), 8));
    expect(colorsOf(decoded)).toEqual(Array.from({ length: width * height }, (_, i) => colors[i % colors.length]));
  });

  it('an image with exactly 256 distinct colors loses nothing', () => {
    const colors = Array.from({ length: 256 }, (_, i): Color => [i, 255 - i, (i * 7) & 255]);
    const bytes = encodeBMP(image(16, 16, colors), 8);
    expect(colorsOf(decodeBMP(bytes))).toEqual(colors);
    expect(new Set(bmpPalette(bytes).map(String))).toEqual(new Set(colors.map(String)));
  });

  it('with more than 256 colors, quantizes to a 256-color palette and assigns the nearest', () => {
    const width = 40;
    const height = 40;
    const colors = Array.from({ length: width * height }, (_, i): Color => {
      const x = i % width;
      const y = Math.floor(i / width);
      return [x * 6, y * 6, 128];
    });
    const bytes = encodeBMP(image(width, height, colors), 8);
    expect(bmpLayout(bytes)).toEqual(expectedBmpLayout(width, height, 8));
    const decoded = colorsOf(decodeBMP(bytes));
    expect(new Set(decoded.map(String)).size).toBeLessThanOrEqual(256);
    let maxError = 0;
    decoded.forEach((c, i) => {
      for (let k = 0; k < 3; k++) maxError = Math.max(maxError, Math.abs(c[k] - colors[i][k]));
    });
    expect(maxError).toBeLessThanOrEqual(24);
  });

  it('accepts data that is a misaligned view of a larger buffer', () => {
    const colors = arbitraryColors(6);
    const source = image(3, 2, colors);
    const backing = new Uint8ClampedArray(source.data.length + 5);
    backing.set(source.data, 1);
    const img: RasterImage = { width: 3, height: 2, data: backing.subarray(1, 1 + source.data.length) };
    expect(colorsOf(decodeBMP(encodeBMP(img, 8)))).toEqual(colors);
    expect(colorsOf(decodeBMP(encodeBMP(img, 24)))).toEqual(colors);
  });
});

describe('encodeBMP 4-bit', () => {
  it('writes the header and the 16-color VGA palette', () => {
    const bytes = encodeBMP(image(5, 3, VGA), 4);
    expect(bmpLayout(bytes)).toEqual(expectedBmpLayout(5, 3, 4));
    expect(bmpHeader(bytes).pixelOffset).toBe(14 + 40 + 64);
    expect(bmpPalette(bytes)).toEqual(VGA);
  });

  it.each([
    [3, 2],
    [5, 3],
    [4, 4],
    [9, 2],
  ])('exact round trip at %i×%i using palette colors', (width, height) => {
    const colors = Array.from({ length: width * height }, (_, i) => VGA[(i * 7 + 3) % 16]);
    const decoded = decodeBMP(encodeBMP(image(width, height, colors), 4));
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(colorsOf(decoded)).toEqual(colors);
  });

  it('packs two pixels per byte, the first in the high nibble', () => {
    const bytes = encodeBMP(image(3, 1, [VGA[9], VGA[10], VGA[12]]), 4);
    expect(Array.from(bytes.subarray(118))).toEqual([0x9a, 0xc0, 0, 0]);
  });

  it('assigns the nearest VGA color, without dithering', () => {
    const img = image(6, 1, [
      [250, 10, 5],
      [100, 100, 100],
      [200, 200, 200],
      [10, 10, 140],
      [140, 120, 10],
      [10, 20, 30],
    ]);
    img.data[23] = 0; // the last one, transparent → white
    const decoded = decodeBMP(encodeBMP(img, 4));
    expect(colorsOf(decoded)).toEqual([VGA[9], VGA[8], VGA[7], VGA[4], VGA[3], WHITE]);
  });
});

describe('encodeBMP 1-bit', () => {
  it('writes the header and the [black, white] palette', () => {
    const bytes = encodeBMP(image(5, 3, [BLACK, WHITE]), 1);
    expect(bmpLayout(bytes)).toEqual(expectedBmpLayout(5, 3, 1));
    expect(bmpHeader(bytes).pixelOffset).toBe(14 + 40 + 8);
    expect(Array.from(bytes.subarray(54, 62))).toEqual([0, 0, 0, 0, 255, 255, 255, 0]);
  });

  it.each([
    [3, 2],
    [5, 3],
    [33, 2],
  ])('exact round trip at %i×%i in black and white', (width, height) => {
    const colors = Array.from({ length: width * height }, (_, i) => ((i * 5) % 3 === 0 ? WHITE : BLACK));
    const decoded = decodeBMP(encodeBMP(image(width, height, colors), 1));
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(colorsOf(decoded)).toEqual(colors);
  });

  it('packs eight pixels per byte, the first in the high bit', () => {
    const bytes = encodeBMP(image(9, 1, [WHITE, BLACK]), 1);
    expect(Array.from(bytes.subarray(62))).toEqual([0xaa, 0x80, 0, 0]);
  });

  it('decides by luminance threshold (>= 128 → white)', () => {
    const img = image(6, 1, [
      [127, 127, 127],
      [128, 128, 128],
      [255, 0, 0],
      [255, 255, 0],
      [0, 0, 255],
      [0, 0, 0],
    ]);
    img.data[23] = 0; // transparent → white
    expect(colorsOf(decodeBMP(encodeBMP(img, 1)))).toEqual([BLACK, WHITE, BLACK, WHITE, BLACK, WHITE]);
  });
});

describe('encodeBMP: invalid input', () => {
  it('rejects unsupported depths and dimensions', () => {
    expect(() => encodeBMP(image(2, 2, [BLACK]), 16 as number as BmpDepth)).toThrow(RangeError);
    expect(() => encodeBMP({ width: 0, height: 2, data: new Uint8ClampedArray(0) }, 24)).toThrow(RangeError);
    expect(() => encodeBMP({ width: 2, height: 2, data: new Uint8ClampedArray(8) }, 24)).toThrow(RangeError);
  });
});

function gifLayout(bytes: Uint8Array) {
  return {
    signature: ascii(bytes, 0, 6),
    width: view(bytes).getUint16(6, true),
    height: view(bytes).getUint16(8, true),
    globalColorTable: (bytes[10] & 0x80) !== 0,
    trailer: bytes[bytes.length - 1],
  };
}

function expectedGifLayout(width: number, height: number): ReturnType<typeof gifLayout> {
  return { signature: 'GIF89a', width, height, globalColorTable: true, trailer: 0x3b };
}

describe('encodeGIF', () => {
  it('writes the header, logical screen and trailer', () => {
    expect(gifLayout(encodeGIF(image(5, 3, VGA)))).toEqual(expectedGifLayout(5, 3));
    expect(gifLayout(encodeGIF(image(300, 2, arbitraryColors(600))))).toEqual(expectedGifLayout(300, 2));
    expect(gifLayout(encodeGIF(image(1, 1, [WHITE])))).toEqual(expectedGifLayout(1, 1));
  });

  it('with 256 colors or fewer, the global palette contains the exact colors', () => {
    const colors: Color[] = [
      [0, 0, 0],
      [1, 1, 1],
      [200, 100, 50],
      [201, 100, 50],
    ];
    const bytes = encodeGIF(image(4, 2, colors));
    const tableSize = 2 ** ((bytes[10] & 7) + 1);
    const table = new Set(
      Array.from({ length: tableSize }, (_, i) => String(Array.from(bytes.subarray(13 + i * 3, 16 + i * 3)))),
    );
    for (const c of colors) expect(table.has(String(c))).toBe(true);
  });

  it('quantizes images with more than 256 colors', () => {
    const colors = Array.from({ length: 64 * 64 }, (_, i): Color => [(i % 64) * 4, Math.floor(i / 64) * 4, 77]);
    const bytes = encodeGIF(image(64, 64, colors));
    expect(gifLayout(bytes)).toEqual(expectedGifLayout(64, 64));
    expect(bytes[10] & 7).toBe(7); // 256 entries
  });
});

describe('encodeTIFF', () => {
  interface IfdEntry {
    type: number;
    count: number;
    value: number;
  }

  function readIfd(bytes: Uint8Array): { tags: number[]; entries: Map<number, IfdEntry>; next: number } {
    const v = view(bytes);
    const offset = v.getUint32(4, true);
    const count = v.getUint16(offset, true);
    const tags: number[] = [];
    const entries = new Map<number, IfdEntry>();
    for (let i = 0; i < count; i++) {
      const p = offset + 2 + i * 12;
      const tag = v.getUint16(p, true);
      const type = v.getUint16(p + 2, true);
      const n = v.getUint32(p + 4, true);
      const value = type === 3 && n === 1 ? v.getUint16(p + 8, true) : v.getUint32(p + 8, true);
      tags.push(tag);
      entries.set(tag, { type, count: n, value });
    }
    return { tags, entries, next: v.getUint32(offset + 2 + count * 12, true) };
  }

  it('writes the little-endian header "II*\\0"', () => {
    const bytes = encodeTIFF(image(5, 3, arbitraryColors(15)));
    expect(Array.from(bytes.subarray(0, 4))).toEqual([0x49, 0x49, 0x2a, 0x00]);
    expect(view(bytes).getUint32(4, true) % 2).toBe(0);
  });

  it('includes the tags of a baseline RGB TIFF, in order', () => {
    const width = 5;
    const height = 3;
    const bytes = encodeTIFF(image(width, height, arbitraryColors(15)));
    const v = view(bytes);
    const { tags, entries, next } = readIfd(bytes);
    expect(tags).toEqual(tags.toSorted((a, b) => a - b));
    expect(next).toBe(0);

    const scalar = (tag: number) => {
      const e = entries.get(tag);
      expect(e, `etiqueta ${tag}`).toBeDefined();
      expect(e?.count).toBe(1);
      return e?.value;
    };
    expect(scalar(256)).toBe(width); // ImageWidth
    expect(scalar(257)).toBe(height); // ImageLength
    expect(scalar(259)).toBe(1); // Compression
    expect(scalar(262)).toBe(2); // PhotometricInterpretation
    expect(scalar(277)).toBe(3); // SamplesPerPixel
    expect(scalar(278)).toBe(height); // RowsPerStrip
    expect(scalar(279)).toBe(width * height * 3); // StripByteCounts
    expect(scalar(296)).toBe(2); // ResolutionUnit
    expect(scalar(273)).toBeTypeOf('number'); // StripOffsets

    const bits = entries.get(258); // BitsPerSample
    expect(bits).toMatchObject({ type: 3, count: 3 });
    const bitsOffset = bits?.value ?? 0;
    expect([0, 1, 2].map((i) => v.getUint16(bitsOffset + i * 2, true))).toEqual([8, 8, 8]);

    for (const tag of [282, 283]) {
      const resolution = entries.get(tag); // XResolution / YResolution
      expect(resolution).toMatchObject({ type: 5, count: 1 });
      const o = resolution?.value ?? 0;
      expect([v.getUint32(o, true), v.getUint32(o + 4, true)]).toEqual([96, 1]);
    }
  });

  it('the strip bytes are the image RGB', () => {
    const width = 5;
    const height = 3;
    const colors = arbitraryColors(width * height);
    const bytes = encodeTIFF(image(width, height, colors));
    const { entries } = readIfd(bytes);
    const offset = entries.get(273)?.value ?? 0;
    const length = entries.get(279)?.value ?? 0;
    expect(offset % 2).toBe(0);
    expect(offset + length).toBe(bytes.length);
    expect(Array.from(bytes.subarray(offset, offset + length))).toEqual(colors.flat());
  });
});

/** Hand-made 32-bit BMP. `pixels`: BGRA per pixel in file order. */
function bmp32(
  width: number,
  height: number,
  pixels: readonly number[],
  { headerSize = 124, compression = 0, masks = [0xff0000, 0xff00, 0xff, 0xff000000] } = {},
): Uint8Array {
  const masksAfterHeader = headerSize === 40 && compression === 3 ? 12 : 0;
  const offset = 14 + headerSize + masksAfterHeader;
  const bytes = new Uint8Array(offset + pixels.length);
  const v = view(bytes);
  bytes[0] = 0x42;
  bytes[1] = 0x4d;
  v.setUint32(2, bytes.length, true);
  v.setUint32(10, offset, true);
  v.setUint32(14, headerSize, true);
  v.setInt32(18, width, true);
  v.setInt32(22, height, true);
  v.setUint16(26, 1, true);
  v.setUint16(28, 32, true);
  v.setUint32(30, compression, true);
  v.setUint32(34, pixels.length, true);
  const maskCount = headerSize >= 56 ? 4 : 3;
  if (headerSize > 40 || compression === 3) {
    for (let i = 0; i < maskCount; i++) v.setUint32(54 + i * 4, masks[i], true);
  }
  bytes.set(pixels, offset);
  return bytes;
}

describe('decodeBMP', () => {
  it('rejects truncated files with an Error', () => {
    const bytes = encodeBMP(image(5, 3, VGA), 4);
    expect(() => decodeBMP(bytes.subarray(0, bytes.length - 1))).toThrow(/Truncated/);
    expect(() => decodeBMP(bytes.subarray(0, 60))).toThrow(Error);
    expect(() => decodeBMP(bytes.subarray(0, 30))).toThrow(/Truncated/);
    expect(() => decodeBMP(bytes.subarray(0, 10))).toThrow(/Truncated/);
    expect(() => decodeBMP(new Uint8Array(0))).toThrow(Error);
  });

  it('rejects non-BMP data and unsupported variants', () => {
    expect(() => decodeBMP(encodeGIF(image(2, 2, VGA)))).toThrow(/BM/);
    const rle = encodeBMP(image(4, 2, VGA), 8);
    view(rle).setUint32(30, 1, true);
    expect(() => decodeBMP(rle)).toThrow(/RLE/);
    const sixteen = encodeBMP(image(4, 2, VGA), 24);
    view(sixteen).setUint16(28, 16, true);
    expect(() => decodeBMP(sixteen)).toThrow(/16 bits/);
    const swapped = bmp32(1, 1, [1, 2, 3, 255], { compression: 3, masks: [0xff, 0xff00, 0xff0000, 0xff000000] });
    expect(() => decodeBMP(swapped)).toThrow(/bit masks/);
  });

  it('reads top-down rows (negative height)', () => {
    const width = 5;
    const height = 3;
    const colors = arbitraryColors(width * height);
    const bottomUp = encodeBMP(image(width, height, colors), 24);
    const stride = rowSize(width, 24);
    const topDown = bottomUp.slice();
    view(topDown).setInt32(22, -height, true);
    for (let row = 0; row < height; row++) {
      topDown.set(bottomUp.subarray(54 + row * stride, 54 + (row + 1) * stride), 54 + (height - 1 - row) * stride);
    }
    const decoded = decodeBMP(topDown);
    expect(decoded.height).toBe(height);
    expect(colorsOf(decoded)).toEqual(colors);
  });

  it('reads a 32-bit V5 BMP with alpha, top-down', () => {
    const decoded = decodeBMP(bmp32(2, -2, [3, 2, 1, 255, 30, 20, 10, 128, 0, 0, 255, 0, 255, 255, 255, 64]));
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(Array.from(decoded.data)).toEqual([1, 2, 3, 255, 10, 20, 30, 128, 255, 0, 0, 0, 255, 255, 255, 64]);
  });

  it('reads a 32-bit BMP with standard BI_BITFIELDS and a 40-byte header (bottom-up)', () => {
    const decoded = decodeBMP(
      bmp32(1, 2, [3, 2, 1, 0, 6, 5, 4, 0], { headerSize: 40, compression: 3, masks: [0xff0000, 0xff00, 0xff, 0] }),
    );
    expect(Array.from(decoded.data)).toEqual([4, 5, 6, 255, 1, 2, 3, 255]);
  });

  it('an uncompressed 32-bit BMP with all alpha at 0 is opaque', () => {
    const decoded = decodeBMP(bmp32(2, 1, [3, 2, 1, 0, 6, 5, 4, 0], { headerSize: 108 }));
    expect(Array.from(decoded.data)).toEqual([1, 2, 3, 255, 4, 5, 6, 255]);
  });

  it('accepts a Uint8Array that is a view of a larger buffer', () => {
    const colors = arbitraryColors(6);
    const bytes = encodeBMP(image(3, 2, colors), 24);
    const backing = new Uint8Array(bytes.length + 7);
    backing.set(bytes, 3);
    expect(colorsOf(decodeBMP(backing.subarray(3, 3 + bytes.length)))).toEqual(colors);
  });
});
