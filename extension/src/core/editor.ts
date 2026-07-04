import type { Point } from './geometry';
import { AnnotationState, type Annotation, type ToolKind } from './annotations';
import { render, type PixelCanvasLike } from './renderer';
import { canvasToPngBlob } from './png';

export interface AnnotationEditorOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  image: CanvasImageSource;
  /** Scratch-canvas factory forwarded to the renderer so the pixelate tool can redact. */
  createCanvas?: (w: number, h: number) => PixelCanvasLike;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Gets a 2D context from either canvas kind. Calling `.getContext('2d')`
 * directly on the `HTMLCanvasElement | OffscreenCanvas` union trips TS2349
 * under stricter lib configs (incompatible overload signatures), so narrow
 * to one member before the call.
 */
function get2DContext(c: HTMLCanvasElement | OffscreenCanvas): Ctx2D | null {
  return (c as HTMLCanvasElement).getContext('2d') as Ctx2D | null;
}

/**
 * Drives freehand/shape annotation over a base image on a canvas.
 * Framework-free: no browser-extension APIs, only DOM/canvas primitives
 * (so it can host inside a Wails webview unchanged).
 */
export class AnnotationEditor {
  private canvas: HTMLCanvasElement | OffscreenCanvas;
  private image: CanvasImageSource;
  private ctx: Ctx2D;
  private createCanvas?: (w: number, h: number) => PixelCanvasLike;
  private state = new AnnotationState();
  private tool: ToolKind = 'arrow';
  private color = '#e5484d';
  private strokeWidth = 3;
  private drawing = false;
  private current: Annotation | null = null;

  constructor(opts: AnnotationEditorOptions) {
    this.canvas = opts.canvas;
    this.image = opts.image;
    this.createCanvas = opts.createCanvas;
    const ctx = get2DContext(this.canvas);
    if (!ctx) throw new Error('AnnotationEditor: could not get 2d context');
    this.ctx = ctx;
    this.redraw();
  }

  setTool(tool: ToolKind): void {
    this.tool = tool;
  }

  setColor(color: string): void {
    this.color = color;
  }

  /** Sets the stroke width for subsequent annotations, clamped to [1, 12] px. */
  setStrokeWidth(w: number): void {
    this.strokeWidth = Math.max(1, Math.min(12, w));
  }

  get currentTool(): ToolKind {
    return this.tool;
  }

  get currentColor(): string {
    return this.color;
  }

  get currentStrokeWidth(): number {
    return this.strokeWidth;
  }

  pointerDown(point: Point): void {
    // Text is click-placed via addText(); drags on the text tool are ignored.
    if (this.tool === 'text') return;
    this.drawing = true;
    const points = this.tool === 'pen' ? [point] : [point, point];
    this.current = { tool: this.tool, color: this.color, width: this.strokeWidth, points };
  }

  /** Places a single-line text label at `point`. Empty/whitespace text is ignored. */
  addText(point: Point, text: string): void {
    if (!text.trim()) return;
    this.state.add({ tool: 'text', color: this.color, width: this.strokeWidth, points: [point], text });
    this.redraw();
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
    render(this.ctx, this.image, live, { createCanvas: this.createCanvas });
  }
}
