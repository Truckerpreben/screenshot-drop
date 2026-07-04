import type { Annotation } from './annotations';
import { arrowHead } from './geometry';

export interface RenderOptions {
  lineWidth?: number;
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
    drawAnnotation(ctx, annotation, fallbackWidth);
  }
}

function drawAnnotation(ctx: Ctx2D, annotation: Annotation, fallbackWidth: number): void {
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
