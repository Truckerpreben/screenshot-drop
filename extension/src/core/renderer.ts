import type { Annotation } from './annotations';
import { arrowHead, clampRectToBounds, normalizeRect, pixelGrid } from './geometry';

/** Minimal 2D context surface the pixelate pass needs from a scratch canvas. */
export interface PixelCtxLike {
  drawImage(image: CanvasImageSource, ...coords: number[]): void;
  imageSmoothingEnabled: boolean;
}

/** Minimal canvas surface the pixelate pass needs from the injected factory. */
export interface PixelCanvasLike {
  width: number;
  height: number;
  getContext(kind: '2d'): PixelCtxLike | null;
}

export interface RenderOptions {
  lineWidth?: number;
  /**
   * Factory for a scratch canvas used by the pixelate tool (OffscreenCanvas in
   * the extension, an <canvas> in Wails). When absent, pixelate is a no-op.
   */
  createCanvas?: (w: number, h: number) => PixelCanvasLike;
}

const DEFAULT_LINE_WIDTH = 3;
const ARROW_HEAD_LENGTH = 14;
const ARROW_HEAD_ANGLE = Math.PI / 7;

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Draws the base image, then each annotation on top, in immediate mode. */
export function render(
  ctx: Ctx2D,
  baseImage: CanvasImageSource,
  annotations: readonly Annotation[],
  opts: RenderOptions = {}
): void {
  const canvas = ctx.canvas as { width: number; height: number };
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(baseImage, 0, 0);

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const fallbackWidth = opts.lineWidth ?? DEFAULT_LINE_WIDTH;
  for (const annotation of annotations) {
    drawAnnotation(ctx, annotation, baseImage, fallbackWidth, opts.createCanvas);
  }
}

function drawAnnotation(
  ctx: Ctx2D,
  annotation: Annotation,
  baseImage: CanvasImageSource,
  fallbackWidth: number,
  createCanvas?: (w: number, h: number) => PixelCanvasLike
): void {
  // Per-annotation stroke width; fall back to the default when unset or 0.
  const width = annotation.width && annotation.width > 0 ? annotation.width : fallbackWidth;
  ctx.strokeStyle = annotation.color;
  ctx.lineWidth = width;
  switch (annotation.tool) {
    case 'line':
    case 'rect':
      drawShape(ctx, annotation);
      break;
    case 'arrow':
      drawArrow(ctx, annotation, width);
      break;
    case 'pen':
      drawPen(ctx, annotation);
      break;
    case 'text':
      drawText(ctx, annotation, width);
      break;
    case 'pixelate':
      drawPixelate(ctx, annotation, baseImage, createCanvas);
      break;
  }
}

function drawShape(ctx: Ctx2D, annotation: Annotation): void {
  const [start, end] = annotation.points;
  if (!start || !end) return;
  ctx.beginPath();
  if (annotation.tool === 'rect') {
    ctx.strokeRect(start.x, start.y, end.x - start.x, end.y - start.y);
  } else {
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }
}

function drawArrow(ctx: Ctx2D, annotation: Annotation, width: number): void {
  const [start, end] = annotation.points;
  if (!start || !end) return;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();

  // Scale the head subtly with stroke width so a thick shaft doesn't get a stubby head.
  const headLen = ARROW_HEAD_LENGTH + width * 2;
  const [left, right] = arrowHead(start, end, headLen, ARROW_HEAD_ANGLE);
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(left.x, left.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(end.x, end.y);
  ctx.lineTo(right.x, right.y);
  ctx.stroke();
}

function drawPen(ctx: Ctx2D, annotation: Annotation): void {
  if (annotation.points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(annotation.points[0].x, annotation.points[0].y);
  for (const point of annotation.points.slice(1)) {
    ctx.lineTo(point.x, point.y);
  }
  ctx.stroke();
}

function drawText(ctx: Ctx2D, annotation: Annotation, width: number): void {
  const [p] = annotation.points;
  if (!p || !annotation.text) return;
  const fontSize = 8 + width * 3;
  ctx.font = `600 ${fontSize}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  // A dark outline behind the colored fill keeps the label legible over any background.
  ctx.lineWidth = Math.max(2, fontSize / 6);
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.strokeText(annotation.text, p.x, p.y);
  ctx.fillStyle = annotation.color;
  ctx.fillText(annotation.text, p.x, p.y);
}

function drawPixelate(
  ctx: Ctx2D,
  annotation: Annotation,
  baseImage: CanvasImageSource,
  createCanvas?: (w: number, h: number) => PixelCanvasLike
): void {
  const [start, end] = annotation.points;
  // Graceful no-op if the region is incomplete or no scratch-canvas factory was supplied.
  if (!start || !end || !createCanvas) return;
  const canvas = ctx.canvas as { width: number; height: number };
  const r = clampRectToBounds(normalizeRect(start, end), { width: canvas.width, height: canvas.height });
  if (r.width < 1 || r.height < 1) return;

  const blockSize = Math.max(4, (annotation.width ?? 3) * 2);
  const { cols, rows } = pixelGrid(r, blockSize);
  const tmp = createCanvas(cols, rows);
  const tctx = tmp.getContext('2d');
  if (!tctx) return;

  // Downscale the region to a coarse grid, then upscale it back with smoothing
  // off to get blocky pixels.
  // NOTE: pixelate samples the BASE image, so any annotation drawn *before* it
  // is covered by the redaction — this is the intended redaction semantic.
  tctx.drawImage(baseImage, r.x, r.y, r.width, r.height, 0, 0, cols, rows);
  const prevSmoothing = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(tmp as unknown as CanvasImageSource, 0, 0, cols, rows, r.x, r.y, r.width, r.height);
  ctx.imageSmoothingEnabled = prevSmoothing;
}
