import type { Point } from './geometry';

export type ToolKind = 'arrow' | 'rect' | 'line' | 'pen';

export interface Annotation {
  tool: ToolKind;
  color: string;
  points: Point[];
  /** Stroke width in px. Optional for back-compat; the renderer falls back to 3 when absent or 0. */
  width?: number;
}

/** Mutable, undoable list of annotations drawn on a single capture. */
export class AnnotationState {
  private list: Annotation[] = [];

  add(annotation: Annotation): void {
    this.list.push(annotation);
  }

  undo(): void {
    this.list.pop();
  }

  clear(): void {
    this.list = [];
  }

  get annotations(): readonly Annotation[] {
    return this.list;
  }
}
