/**
 * Type declarations for gifenc@1.0.3 (the package ships no types).
 * Signatures taken from node_modules/gifenc/src/{index,palettize,pnnquant2,stream}.js.
 */
declare module 'gifenc' {
  /** Palette color: [r, g, b] (rgb565/rgb444 formats) or [r, g, b, a] (rgba4444 format). Components 0..255. */
  export type PaletteColor = number[];
  export type Palette = PaletteColor[];

  /** Precision of the histogram / internal cache: rgb565 (default), rgb444 or rgba4444 (with alpha). */
  export type PaletteFormat = 'rgb565' | 'rgb444' | 'rgba4444';

  /** RGBA data is read as `new Uint32Array(rgba.buffer)`: the array must cover its entire buffer. */
  export type RGBAData = Uint8Array | Uint8ClampedArray;

  export type ColorDistance = (a: ArrayLike<number>, b: ArrayLike<number>) => number;

  export interface QuantizeOptions {
    format?: PaletteFormat;
    /** rgba4444 only: forces alpha to 0 or 255 (numeric threshold, or 127 if `true`). */
    oneBitAlpha?: boolean | number;
    /** rgba4444 only: colors with alpha <= clearAlphaThreshold become clearAlphaColor. */
    clearAlpha?: boolean;
    clearAlphaColor?: number;
    clearAlphaThreshold?: number;
    useSqrt?: boolean;
  }

  /** PnnQuant quantization: returns at most `maxColors` distinct colors. */
  export function quantize(rgba: RGBAData, maxColors: number, options?: QuantizeOptions): Palette;

  /** Index of the nearest palette color for each pixel (cache keyed by rgb565/rgb444/rgba4444). */
  export function applyPalette(rgba: RGBAData, palette: Palette, format?: PaletteFormat): Uint8Array<ArrayBuffer>;

  export interface PrequantizeOptions {
    roundRGB?: number;
    roundAlpha?: number;
    oneBitAlpha?: boolean | number | null;
  }

  /** Rounds the channels in place to reduce the number of colors before quantizing. */
  export function prequantize(rgba: RGBAData, options?: PrequantizeOptions): void;

  export function nearestColorIndex(colors: Palette, pixel: ArrayLike<number>, distanceFn?: ColorDistance): number;
  export function nearestColorIndexWithDistance(
    colors: Palette,
    pixel: ArrayLike<number>,
    distanceFn?: ColorDistance,
  ): [index: number, distance: number];
  export function nearestColor(
    colors: Palette,
    pixel: ArrayLike<number>,
    distanceFn?: ColorDistance,
  ): PaletteColor | undefined;
  /** Replaces in place the colors in `palette` within distance <= threshold of any of `knownColors`. */
  export function snapColorsToPalette(palette: Palette, knownColors: Palette, threshold?: number): void;

  export interface GIFEncoderOptions {
    initialCapacity?: number;
    /** true (default): the header, logical screen and global palette are written with the first frame. */
    auto?: boolean;
  }

  export interface WriteFrameOptions {
    /** Required on the first frame (global palette); on the others it is written as a local palette. */
    palette?: Palette | null;
    transparent?: boolean;
    transparentIndex?: number;
    /** Delay in milliseconds. */
    delay?: number;
    /** -1 = no NETSCAPE extension (no looping), 0 = loop forever, >0 = number of repetitions. */
    repeat?: number;
    colorDepth?: number;
    dispose?: number;
    /** Only with `auto: false`: marks this as the first frame. */
    first?: boolean;
  }

  export interface GIFStream {
    readonly buffer: ArrayBuffer;
    reset(): void;
    bytesView(): Uint8Array<ArrayBuffer>;
    bytes(): Uint8Array<ArrayBuffer>;
    writeByte(byte: number): void;
    writeBytes(data: ArrayLike<number>, offset?: number, byteLength?: number): void;
    writeBytesView(data: Uint8Array, offset?: number, byteLength?: number): void;
  }

  export interface GIFEncoderInstance {
    reset(): void;
    /** Writes the file terminator (0x3B). */
    finish(): void;
    /** Copy of the written bytes. */
    bytes(): Uint8Array<ArrayBuffer>;
    /** View (no copy) of the written bytes. */
    bytesView(): Uint8Array<ArrayBuffer>;
    readonly buffer: ArrayBuffer;
    readonly stream: GIFStream;
    writeHeader(): void;
    /** `index`: one palette index per pixel (width * height bytes). */
    writeFrame(index: Uint8Array, width: number, height: number, options?: WriteFrameOptions): void;
  }

  export function GIFEncoder(options?: GIFEncoderOptions): GIFEncoderInstance;
  export default GIFEncoder;
}
