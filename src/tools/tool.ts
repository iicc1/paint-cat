import type { ToolId } from '../app/state';

/** Pointer event data already translated to image coordinates. */
export interface PointerInfo {
  /** Image coordinates (fractional). */
  x: number;
  y: number;
  /** Pixel under the pointer (integers). */
  px: number;
  py: number;
  /** 0 = primary (Color 1), 2 = secondary (Color 2). */
  button: 0 | 2;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  inside: boolean;
  clientX: number;
  clientY: number;
}

/** Context for drawing overlays in screen coordinates (view CSS pixels). */
export interface OverlayContext {
  ctx: CanvasRenderingContext2D;
  zoom: number;
  /** Converts image coordinates to view coordinates. */
  toView(x: number, y: number): { x: number; y: number };
}

export interface Tool {
  readonly id: ToolId;
  /** CSS `cursor` value for the given position (null = outside the canvas / no pointer). */
  cursor(p: PointerInfo | null): string;
  down?(p: PointerInfo): void;
  move?(p: PointerInfo): void;
  up?(p: PointerInfo): void;
  hover?(p: PointerInfo | null): void;
  dblclick?(p: PointerInfo): void;
  /** Called periodically while the button is held down (airbrush). */
  hold?(): void;
  key?(e: KeyboardEvent): boolean;
  activate?(): void;
  /** Must commit any live object (shape, text, floating selection) to the image. */
  deactivate?(): void;
  overlay?(o: OverlayContext): void;
  /** There is an object being edited (shape or text) that Esc/Undo must cancel. */
  hasLive?(): boolean;
  commitLive?(): void;
  cancelLive?(): void;
  /** The pointer should be captured even if it starts outside the canvas (selections, shapes). */
  readonly acceptsOutside?: boolean;
}
