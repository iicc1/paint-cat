/** Types shared by the drawing engine and the UI. */

export type RGB = readonly [r: number, g: number, b: number];

export interface Point {
  x: number;
  y: number;
}

/** Rectangle in image coordinates (document pixels). w and h are always >= 0. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The 9 brushes of the "Brushes" dropdown, in gallery order. */
export type BrushKind =
  | 'brush' // Brush
  | 'calligraphy1' // Calligraphy brush 1 (nib slanted "/")
  | 'calligraphy2' // Calligraphy brush 2 (nib slanted "\")
  | 'airbrush' // Airbrush
  | 'oil' // Oil brush
  | 'crayon' // Crayon
  | 'marker' // Marker
  | 'naturalPencil' // Natural pencil
  | 'watercolor'; // Watercolor brush

export const BRUSH_ORDER: readonly BrushKind[] = [
  'brush',
  'calligraphy1',
  'calligraphy2',
  'airbrush',
  'oil',
  'crayon',
  'marker',
  'naturalPencil',
  'watercolor',
];

/** The 23 shapes of the "Shapes" gallery, in gallery order. */
export type ShapeKind =
  | 'line'
  | 'curve'
  | 'ellipse'
  | 'rectangle'
  | 'roundRect'
  | 'polygon'
  | 'triangle'
  | 'rightTriangle'
  | 'diamond'
  | 'pentagon'
  | 'hexagon'
  | 'arrowRight'
  | 'arrowLeft'
  | 'arrowUp'
  | 'arrowDown'
  | 'star4'
  | 'star5'
  | 'star6'
  | 'calloutRoundRect'
  | 'calloutEllipse'
  | 'calloutCloud'
  | 'heart'
  | 'lightning';

export const SHAPE_ORDER: readonly ShapeKind[] = [
  'line',
  'curve',
  'ellipse',
  'rectangle',
  'roundRect',
  'polygon',
  'triangle',
  'rightTriangle',
  'diamond',
  'pentagon',
  'hexagon',
  'arrowRight',
  'arrowLeft',
  'arrowUp',
  'arrowDown',
  'star4',
  'star5',
  'star6',
  'calloutRoundRect',
  'calloutEllipse',
  'calloutCloud',
  'heart',
  'lightning',
];

/** Options of the "Outline" and "Fill" dropdowns. */
export type ShapeStyle = 'none' | 'solid' | 'crayon' | 'marker' | 'oil' | 'naturalPencil' | 'watercolor';

export const SHAPE_STYLE_ORDER: readonly ShapeStyle[] = [
  'none',
  'solid',
  'crayon',
  'marker',
  'oil',
  'naturalPencil',
  'watercolor',
];

/** Polygonal contour (curves already flattened into segments). */
export interface Contour {
  points: Point[];
  closed: boolean;
}
