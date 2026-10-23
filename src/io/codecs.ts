/**
 * Encoders for the "Save as" formats the browser cannot produce with canvas.toBlob
 * (1/4/8/24-bit BMP, GIF and TIFF) and a minimal fallback BMP decoder.
 *
 * All encoders ignore alpha except in one case: fully transparent pixels count as white
 * (Paint images are opaque, but this way an image with gaps does not come out with black holes).
 * A little-endian platform is assumed (as all browser platforms are), like the rest of the engine.
 */
import { GIFEncoder, applyPalette, quantize } from 'gifenc';
import type { Palette } from 'gifenc';

export type BmpDepth = 1 | 4 | 8 | 24;

/** What the encoders need from an ImageData (an equivalent object literal works too). */
export interface RasterImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

/** Result of decodeBMP: RGBA pixels top-down, ready for `new ImageData(data, width, height)`. */
export interface DecodedImage {
  width: number;
  height: number;
  data: Uint8ClampedArray<ArrayBuffer>;
}

// ---------------------------------------------------------------------------------------------------------------
// Shared utilities

/** Classic 16-color VGA palette, in Windows index order. */
const VGA16: Palette = [
  [0, 0, 0], // black
  [128, 0, 0], // maroon
  [0, 128, 0], // green
  [128, 128, 0], // olive
  [0, 0, 128], // navy
  [128, 0, 128], // purple
  [0, 128, 128], // teal
  [192, 192, 192], // silver
  [128, 128, 128], // gray
  [255, 0, 0], // red
  [0, 255, 0], // lime
  [255, 255, 0], // yellow
  [0, 0, 255], // blue
  [255, 0, 255], // fuchsia
  [0, 255, 255], // aqua
  [255, 255, 255], // white
];

const MONOCHROME: Palette = [
  [0, 0, 0],
  [255, 255, 255],
];

/**
 * Copies the pixels to a dedicated buffer (aligned and of the exact size, as gifenc requires) with alpha 255;
 * fully transparent ones become white.
 */
function opaquePixels(img: RasterImage): Uint8ClampedArray<ArrayBuffer> {
  const { width, height, data } = img;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new RangeError(`Invalid image dimensions: ${width}×${height}`);
  }
  const length = width * height * 4;
  if (data.length < length) {
    throw new RangeError(`Missing pixels: ${data.length} bytes for a ${width}×${height} image`);
  }
  const rgba = new Uint8ClampedArray(length);
  rgba.set(data.length === length ? data : data.subarray(0, length));
  const px = new Uint32Array(rgba.buffer);
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    px[i] = v >>> 24 === 0 ? 0xffffffff : v | 0xff000000;
  }
  return rgba;
}

interface IndexedPixels {
  palette: Palette;
  /** One palette index per pixel, top-down. */
  indices: Uint8Array;
}

/**
 * Palette of up to 256 colors. If the image has 256 distinct colors or fewer they are used as is (lossless);
 * if it has more, it is quantized with gifenc and each pixel takes the nearest palette color (no dithering).
 */
function indexTo256(rgba: Uint8ClampedArray<ArrayBuffer>): IndexedPixels {
  const px = new Uint32Array(rgba.buffer);
  const indices = new Uint8Array(px.length);
  const palette: Palette = [];
  const lookup = new Map<number, number>();
  let lastKey = -1;
  let lastIndex = 0;
  for (let i = 0; i < px.length; i++) {
    const key = px[i] & 0xffffff;
    if (key !== lastKey) {
      let index = lookup.get(key);
      if (index === undefined) {
        if (palette.length === 256) {
          const quantized = quantize(rgba, 256);
          return { palette: quantized, indices: applyPalette(rgba, quantized) };
        }
        index = palette.length;
        lookup.set(key, index);
        palette.push([key & 0xff, (key >>> 8) & 0xff, key >>> 16]);
      }
      lastKey = key;
      lastIndex = index;
    }
    indices[i] = lastIndex;
  }
  return { palette, indices };
}

function nearestIndex(r: number, g: number, b: number, palette: Palette): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const c = palette[i];
    const dr = r - c[0];
    const dg = g - c[1];
    const db = b - c[2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = i;
      if (distance === 0) break;
    }
  }
  return best;
}

/** Nearest color (Euclidean RGB distance) in a fixed palette, no dithering. */
function indexToFixedPalette(rgba: Uint8ClampedArray<ArrayBuffer>, palette: Palette): Uint8Array {
  const px = new Uint32Array(rgba.buffer);
  const indices = new Uint8Array(px.length);
  let lastKey = -1;
  let lastIndex = 0;
  for (let i = 0; i < px.length; i++) {
    const key = px[i] & 0xffffff;
    if (key !== lastKey) {
      lastKey = key;
      lastIndex = nearestIndex(key & 0xff, (key >>> 8) & 0xff, key >>> 16, palette);
    }
    indices[i] = lastIndex;
  }
  return indices;
}

/** Black and white by luminance threshold (Rec. 601): >= 128 → white (index 1). */
function indexToMonochrome(rgba: Uint8ClampedArray<ArrayBuffer>): Uint8Array {
  const indices = new Uint8Array(rgba.length >> 2);
  for (let i = 0, j = 0; i < indices.length; i++, j += 4) {
    indices[i] = 299 * rgba[j] + 587 * rgba[j + 1] + 114 * rgba[j + 2] >= 128_000 ? 1 : 0;
  }
  return indices;
}

// ---------------------------------------------------------------------------------------------------------------
// BMP

const BMP_FILE_HEADER_SIZE = 14;
const BMP_INFO_HEADER_SIZE = 40;
/** 72 DPI expressed in pixels per meter, as Paint stores it. */
const BMP_PIXELS_PER_METER = 2835;

const BI_RGB = 0;
const BI_RLE8 = 1;
const BI_RLE4 = 2;
const BI_BITFIELDS = 3;
const BI_JPEG = 4;
const BI_PNG = 5;
const BI_ALPHABITFIELDS = 6;

function bmpRowSize(width: number, bitsPerPixel: number): number {
  return Math.ceil((width * bitsPerPixel) / 32) * 4;
}

function hex(mask: number): string {
  return '0x' + mask.toString(16).padStart(8, '0');
}

/**
 * Windows BMP (BITMAPINFOHEADER, bottom-up rows padded to 4 bytes, 72 DPI).
 * - 24: BGR.
 * - 8: 256-color palette (exact if the image has <= 256 colors; otherwise quantized with gifenc).
 * - 4: fixed 16-color VGA palette, nearest color, no dithering.
 * - 1: black and white by luminance threshold (>= 128 → white), no dithering.
 */
export function encodeBMP(img: RasterImage, depth: BmpDepth): Uint8Array<ArrayBuffer> {
  if (depth !== 1 && depth !== 4 && depth !== 8 && depth !== 24) {
    throw new RangeError(`Unsupported BMP color depth: ${String(depth)} bits`);
  }
  const rgba = opaquePixels(img);
  const { width, height } = img;

  let palette: Palette = [];
  let indices: Uint8Array = new Uint8Array(0);
  if (depth === 8) {
    ({ palette, indices } = indexTo256(rgba));
  } else if (depth === 4) {
    palette = VGA16;
    indices = indexToFixedPalette(rgba, VGA16);
  } else if (depth === 1) {
    palette = MONOCHROME;
    indices = indexToMonochrome(rgba);
  }

  const paletteEntries = depth === 24 ? 0 : 1 << depth;
  const rowSize = bmpRowSize(width, depth);
  const pixelOffset = BMP_FILE_HEADER_SIZE + BMP_INFO_HEADER_SIZE + paletteEntries * 4;
  const imageSize = rowSize * height;
  const fileSize = pixelOffset + imageSize;
  if (fileSize > 0xffffffff) throw new RangeError(`Image too large for BMP: ${width}×${height}`);

  const out = new Uint8Array(fileSize);
  const view = new DataView(out.buffer);
  // BITMAPFILEHEADER
  out[0] = 0x42; // 'B'
  out[1] = 0x4d; // 'M'
  view.setUint32(2, fileSize, true);
  view.setUint32(10, pixelOffset, true);
  // BITMAPINFOHEADER
  view.setUint32(14, BMP_INFO_HEADER_SIZE, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive: bottom-up rows
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, depth, true);
  view.setUint32(30, BI_RGB, true);
  view.setUint32(34, imageSize, true);
  view.setInt32(38, BMP_PIXELS_PER_METER, true);
  view.setInt32(42, BMP_PIXELS_PER_METER, true);
  view.setUint32(46, paletteEntries, true); // colors used
  view.setUint32(50, 0, true); // important colors: all
  // Palette (RGBQUAD: B, G, R, 0); unused entries stay black.
  const paletteOffset = BMP_FILE_HEADER_SIZE + BMP_INFO_HEADER_SIZE;
  for (let i = 0; i < palette.length; i++) {
    const [r, g, b] = palette[i];
    const o = paletteOffset + i * 4;
    out[o] = b;
    out[o + 1] = g;
    out[o + 2] = r;
  }

  for (let row = 0; row < height; row++) {
    const y = height - 1 - row;
    const dst = pixelOffset + row * rowSize;
    if (depth === 24) {
      for (let x = 0, s = y * width * 4, d = dst; x < width; x++, s += 4, d += 3) {
        out[d] = rgba[s + 2];
        out[d + 1] = rgba[s + 1];
        out[d + 2] = rgba[s];
      }
    } else if (depth === 8) {
      out.set(indices.subarray(y * width, (y + 1) * width), dst);
    } else {
      const base = y * width;
      for (let x = 0; x < width; x++) {
        const bit = x * depth;
        out[dst + (bit >>> 3)] |= indices[base + x] << (8 - depth - (bit & 7));
      }
    }
  }
  return out;
}

/**
 * Minimal BMP decoder: 1/4/8/24/32-bit BI_RGB (and 32-bit BI_BITFIELDS with standard BGRA masks),
 * bottom-up or top-down rows, BITMAPINFOHEADER headers (and their 52/56-byte variants), V4 and V5.
 * At 32 bits the fourth byte is used as alpha unless it is 0 in every pixel (then the image is opaque).
 */
export function decodeBMP(data: Uint8Array): DecodedImage {
  const length = data.length;
  if (length < BMP_FILE_HEADER_SIZE + 4) {
    throw new Error(`Truncated BMP file: ${length} bytes are not enough for the header`);
  }
  if (data[0] !== 0x42 || data[1] !== 0x4d) throw new Error('Not a BMP file: missing "BM" signature');
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);

  const headerSize = view.getUint32(14, true);
  if (headerSize === 12 || headerSize === 64) {
    throw new Error(`Unsupported OS/2 BMP header (${headerSize} bytes)`);
  }
  if (headerSize !== 40 && headerSize !== 52 && headerSize !== 56 && headerSize !== 108 && headerSize !== 124) {
    throw new Error(`Unknown ${headerSize}-byte BMP header`);
  }
  if (length < BMP_FILE_HEADER_SIZE + headerSize) {
    throw new Error(`Truncated BMP file: the ${headerSize}-byte header is incomplete`);
  }

  const width = view.getInt32(18, true);
  const rawHeight = view.getInt32(22, true);
  const bitsPerPixel = view.getUint16(28, true);
  const compression = view.getUint32(30, true);
  const colorsUsed = view.getUint32(46, true);
  if (width <= 0 || rawHeight === 0 || rawHeight === -0x80000000) {
    throw new Error(`Invalid BMP dimensions: ${width}×${rawHeight}`);
  }
  const topDown = rawHeight < 0;
  const height = Math.abs(rawHeight);
  if (bitsPerPixel !== 1 && bitsPerPixel !== 4 && bitsPerPixel !== 8 && bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new Error(`Unsupported BMP color depth: ${bitsPerPixel} bits per pixel`);
  }

  let paletteOffset = BMP_FILE_HEADER_SIZE + headerSize;
  let useAlpha = bitsPerPixel === 32;
  if (compression === BI_BITFIELDS || compression === BI_ALPHABITFIELDS) {
    if (bitsPerPixel !== 32) {
      throw new Error(`Unsupported ${bitsPerPixel}-bit BMP with bit masks (BI_BITFIELDS)`);
    }
    const maskCount = compression === BI_ALPHABITFIELDS ? 4 : 3;
    if (headerSize === BMP_INFO_HEADER_SIZE) {
      // With BITMAPINFOHEADER the masks come right after the header.
      paletteOffset += maskCount * 4;
      if (length < paletteOffset) throw new Error('Truncated BMP file: missing color masks');
    }
    const red = view.getUint32(54, true);
    const green = view.getUint32(58, true);
    const blue = view.getUint32(62, true);
    const alpha = headerSize >= 56 || maskCount === 4 ? view.getUint32(66, true) : 0;
    if (red !== 0x00ff0000 || green !== 0x0000ff00 || blue !== 0x000000ff || (alpha !== 0 && alpha !== 0xff000000)) {
      throw new Error(
        `Unsupported BMP with non-standard bit masks (R ${hex(red)}, G ${hex(green)}, B ${hex(blue)}, A ${hex(alpha)})`,
      );
    }
    useAlpha = alpha !== 0;
  } else if (compression === BI_RLE8 || compression === BI_RLE4) {
    throw new Error('Unsupported RLE-compressed BMP');
  } else if (compression === BI_JPEG || compression === BI_PNG) {
    throw new Error('Unsupported BMP with embedded JPEG or PNG');
  } else if (compression !== BI_RGB) {
    throw new Error(`Unsupported BMP compression (code ${compression})`);
  }

  // Palette (RGBQUAD) packed as little-endian RGBA; indices without an entry stay opaque black.
  const palette = new Uint32Array(bitsPerPixel <= 8 ? 1 << bitsPerPixel : 0).fill(0xff000000);
  let pixelOffset = view.getUint32(10, true);
  if (palette.length > 0) {
    let entries = colorsUsed === 0 || colorsUsed > palette.length ? palette.length : colorsUsed;
    if (pixelOffset >= paletteOffset) entries = Math.min(entries, Math.floor((pixelOffset - paletteOffset) / 4));
    if (paletteOffset + entries * 4 > length) throw new Error('Truncated BMP file: the palette is incomplete');
    for (let i = 0, o = paletteOffset; i < entries; i++, o += 4) {
      palette[i] = 0xff000000 | (data[o] << 16) | (data[o + 1] << 8) | data[o + 2];
    }
    if (pixelOffset < paletteOffset) pixelOffset = paletteOffset + entries * 4;
  } else if (pixelOffset < paletteOffset) {
    pixelOffset = paletteOffset;
  }

  const rowSize = bmpRowSize(width, bitsPerPixel);
  const pixelBytes = rowSize * height;
  if (pixelOffset + pixelBytes > length) {
    throw new Error(
      `Truncated BMP file: missing pixel data (${pixelBytes} bytes from ${pixelOffset}, the file has ${length})`,
    );
  }

  const out = new Uint8ClampedArray(width * height * 4);
  const outPx = new Uint32Array(out.buffer);
  let anyAlpha = false;
  for (let row = 0; row < height; row++) {
    const y = topDown ? row : height - 1 - row;
    const src = pixelOffset + row * rowSize;
    const base = y * width;
    if (bitsPerPixel === 32) {
      for (let x = 0, s = src, d = base * 4; x < width; x++, s += 4, d += 4) {
        out[d] = data[s + 2];
        out[d + 1] = data[s + 1];
        out[d + 2] = data[s];
        out[d + 3] = data[s + 3];
        if (data[s + 3] !== 0) anyAlpha = true;
      }
    } else if (bitsPerPixel === 24) {
      for (let x = 0, s = src, d = base * 4; x < width; x++, s += 3, d += 4) {
        out[d] = data[s + 2];
        out[d + 1] = data[s + 1];
        out[d + 2] = data[s];
        out[d + 3] = 255;
      }
    } else if (bitsPerPixel === 8) {
      for (let x = 0; x < width; x++) outPx[base + x] = palette[data[src + x]];
    } else {
      const mask = (1 << bitsPerPixel) - 1;
      for (let x = 0; x < width; x++) {
        const bit = x * bitsPerPixel;
        outPx[base + x] = palette[(data[src + (bit >>> 3)] >>> (8 - bitsPerPixel - (bit & 7))) & mask];
      }
    }
  }
  if (bitsPerPixel === 32 && !(useAlpha && anyAlpha)) {
    for (let i = 3; i < out.length; i += 4) out[i] = 255;
  }
  return { width, height, data: out };
}

// ---------------------------------------------------------------------------------------------------------------
// GIF

/** Single-frame GIF with a 256-color palette (gifenc), no transparency or dithering. */
export function encodeGIF(img: RasterImage): Uint8Array<ArrayBuffer> {
  const { width, height } = img;
  if (width > 0xffff || height > 0xffff) {
    throw new RangeError(`Image too large for GIF (maximum 65535×65535): ${width}×${height}`);
  }
  const { palette, indices } = indexTo256(opaquePixels(img));
  const gif = GIFEncoder();
  // repeat -1: no NETSCAPE animation extension.
  gif.writeFrame(indices, width, height, { palette, repeat: -1 });
  gif.finish();
  return gif.bytes();
}

// ---------------------------------------------------------------------------------------------------------------
// TIFF

const TIFF_SHORT = 3;
const TIFF_LONG = 4;
const TIFF_RATIONAL = 5;

/**
 * Uncompressed baseline TIFF, 8-bit-per-channel RGB in a single strip, little-endian ("II*"), 96 DPI.
 */
export function encodeTIFF(img: RasterImage): Uint8Array<ArrayBuffer> {
  const rgba = opaquePixels(img);
  const { width, height } = img;

  const entryCount = 13;
  const ifdOffset = 8;
  const bitsPerSampleOffset = ifdOffset + 2 + entryCount * 12 + 4;
  const xResolutionOffset = bitsPerSampleOffset + 6;
  const yResolutionOffset = xResolutionOffset + 8;
  const stripOffset = yResolutionOffset + 8;
  const stripByteCount = width * height * 3;
  if (stripOffset + stripByteCount > 0xffffffff) {
    throw new RangeError(`Image too large for TIFF: ${width}×${height}`);
  }

  const out = new Uint8Array(stripOffset + stripByteCount);
  const view = new DataView(out.buffer);
  out[0] = 0x49; // 'I'
  out[1] = 0x49; // 'I'
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  view.setUint16(ifdOffset, entryCount, true);
  let p = ifdOffset + 2;
  /** Entries must be in ascending tag order. A single SHORT is left-aligned in the field. */
  const entry = (tag: number, type: number, count: number, value: number) => {
    view.setUint16(p, tag, true);
    view.setUint16(p + 2, type, true);
    view.setUint32(p + 4, count, true);
    if (type === TIFF_SHORT && count === 1) view.setUint16(p + 8, value, true);
    else view.setUint32(p + 8, value, true);
    p += 12;
  };
  entry(256, TIFF_LONG, 1, width); // ImageWidth
  entry(257, TIFF_LONG, 1, height); // ImageLength
  entry(258, TIFF_SHORT, 3, bitsPerSampleOffset); // BitsPerSample: 8, 8, 8
  entry(259, TIFF_SHORT, 1, 1); // Compression: none
  entry(262, TIFF_SHORT, 1, 2); // PhotometricInterpretation: RGB
  entry(273, TIFF_LONG, 1, stripOffset); // StripOffsets
  entry(277, TIFF_SHORT, 1, 3); // SamplesPerPixel
  entry(278, TIFF_LONG, 1, height); // RowsPerStrip: a single strip
  entry(279, TIFF_LONG, 1, stripByteCount); // StripByteCounts
  entry(282, TIFF_RATIONAL, 1, xResolutionOffset); // XResolution
  entry(283, TIFF_RATIONAL, 1, yResolutionOffset); // YResolution
  entry(284, TIFF_SHORT, 1, 1); // PlanarConfiguration: RGBRGB…
  entry(296, TIFF_SHORT, 1, 2); // ResolutionUnit: inches
  view.setUint32(p, 0, true); // no more IFDs

  for (let i = 0; i < 3; i++) view.setUint16(bitsPerSampleOffset + i * 2, 8, true);
  view.setUint32(xResolutionOffset, 96, true);
  view.setUint32(xResolutionOffset + 4, 1, true);
  view.setUint32(yResolutionOffset, 96, true);
  view.setUint32(yResolutionOffset + 4, 1, true);

  for (let s = 0, d = stripOffset; s < rgba.length; s += 4, d += 3) {
    out[d] = rgba[s];
    out[d + 1] = rgba[s + 1];
    out[d + 2] = rgba[s + 2];
  }
  return out;
}
