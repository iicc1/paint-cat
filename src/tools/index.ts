import type { App } from '../app/app';
import type { ToolId } from '../app/state';
import { BrushTool, EraserTool, FillTool, MagnifierTool, PencilTool, PickerTool } from './basic';
import { SelectTool } from './select';
import { ShapeTool } from './shape';
import { TextTool } from './text';
import type { Tool } from './tool';

export function createTools(app: App): Record<ToolId, Tool> {
  return {
    select: new SelectTool(app),
    pencil: new PencilTool(app),
    fill: new FillTool(app),
    text: new TextTool(app),
    eraser: new EraserTool(app),
    picker: new PickerTool(app),
    magnifier: new MagnifierTool(app),
    brush: new BrushTool(app),
    shape: new ShapeTool(app),
  };
}
