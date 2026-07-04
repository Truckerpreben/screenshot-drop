export interface Tile {
  image: CanvasImageSource;
  y: number;
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Draws each tile onto ctx.canvas at its recorded y offset (scaled by dpr),
 * producing one stitched full-page image. Resizes ctx.canvas to
 * totalWidth*dpr x totalHeight*dpr before drawing.
 */
export function stitchTiles(ctx: Ctx2D, tiles: Tile[], totalWidth: number, totalHeight: number, dpr: number): void {
  const canvas = ctx.canvas as { width: number; height: number };
  canvas.width = Math.round(totalWidth * dpr);
  canvas.height = Math.round(totalHeight * dpr);
  for (const tile of tiles) {
    ctx.drawImage(tile.image, 0, Math.round(tile.y * dpr));
  }
}

/**
 * Plans the vertical scroll offsets needed to cover a page of `totalHeight`
 * using a viewport of `viewportHeight`, capturing once per offset. The final
 * offset is adjusted so the last tile's bottom edge lines up with the page
 * bottom (totalHeight - viewportHeight), deduped if it coincides with the
 * last full-step offset already produced.
 */
export function planScrollCapture(viewportHeight: number, totalHeight: number): number[] {
  if (viewportHeight <= 0) {
    return [0];
  }
  if (totalHeight <= viewportHeight) {
    return [0];
  }
  const offsets: number[] = [];
  let y = 0;
  while (y < totalHeight - viewportHeight) {
    offsets.push(y);
    y += viewportHeight;
  }
  const lastOffset = totalHeight - viewportHeight;
  if (offsets[offsets.length - 1] !== lastOffset) {
    offsets.push(lastOffset);
  }
  return offsets;
}
