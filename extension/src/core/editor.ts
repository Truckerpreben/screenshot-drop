import type { Point } from './geometry';
import { AnnotationState, type Annotation, type ToolKind } from './annotations';
import { render } from './renderer';
import { canvasToPngBlob } from './png';

export interface AnnotationEditorOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  image: CanvasImageSource;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Drives freehand/shape annotation over a base image on a canvas.
 * Framework-free: no browser-extension APIs, only DOM/canvas primitives
 * (so it can host inside a Wails webview unchanged).
 */
export class AnnotationEditor {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private image: CanvasImageSource;
  private ctx: Ctx2D;
  private state = new AnnotationState();
  private tool: ToolKind = 'arrow';
  private color = '#e5484d';
  private drawing = false;
  private current: Annotation | null = null;

  constructor(opts: AnnotationEditorOptions) {
    this.canvas = opts.canvas;
    this.image = opts.image;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) throw new Error('AnnotationEditor: could not get 2d context');
    this.ctx = ctx as Ctx2D;
    this.redraw();
  }

  setTool(tool: ToolKind): void {
    this.tool = tool;
  }

  setColor(color: string): void {
    this.color = color;
  }

  get currentTool(): ToolKind {
    return this.tool;
  }

  get currentColor(): string {
    return this.color;
  }

  pointerDown(point: Point): void {
    this.drawing = true;
    const points = this.tool === 'pen' ? [point] : [point, point];
    this.current = { tool: this.tool, color: this.color, points };
  }

  pointerMove(point: Point): void {
    if (!this.drawing || !this.current) return;
    if (this.tool === 'pen') {
      this.current.points.push(point);
    } else {
      this.current.points[1] = point;
    }
    this.redraw();
  }

  pointerUp(): void {
    if (!this.drawing || !this.current) return;
    this.state.add(this.current);
    this.current = null;
    this.drawing = false;
    this.redraw();
  }

  undo(): void {
    this.state.undo();
    this.redraw();
  }

  clear(): void {
    this.state.clear();
    this.redraw();
  }

  get annotations(): readonly Annotation[] {
    return this.state.annotations;
  }

  toBlob(): Promise<Blob> {
    return canvasToPngBlob(this.canvas);
  }

  private redraw(): void {
    const live = this.current ? [...this.state.annotations, this.current] : this.state.annotations;
    render(this.ctx, this.image, live);
  }
}
