export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Builds a normalized (non-negative width/height) rect from two drag points. */
export function normalizeRect(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const width = Math.abs(b.x - a.x);
  const height = Math.abs(b.y - a.y);
  return { x, y, width, height };
}

/** Scales a rect by a device-pixel-ratio factor (CSS px -> device px). */
export function scaleRect(rect: Rect, dpr: number): Rect {
  return {
    x: rect.x * dpr,
    y: rect.y * dpr,
    width: rect.width * dpr,
    height: rect.height * dpr
  };
}

/**
 * Returns the two short line segments that form an arrow head at `to`,
 * angled back toward `from`. `len` is the head segment length in px,
 * `angleRad` is the half-angle of the head in radians.
 */
export function arrowHead(from: Point, to: Point, len: number, angleRad: number): [Point, Point] {
  const theta = Math.atan2(to.y - from.y, to.x - from.x);
  const left: Point = {
    x: to.x - len * Math.cos(theta + angleRad),
    y: to.y - len * Math.sin(theta + angleRad)
  };
  const right: Point = {
    x: to.x - len * Math.cos(theta - angleRad),
    y: to.y - len * Math.sin(theta - angleRad)
  };
  return [left, right];
}

/** Clamps a rect so it lies fully within [0,0]-[bounds.width,bounds.height]. */
export function clampRectToBounds(rect: Rect, bounds: { width: number; height: number }): Rect {
  const x = Math.max(0, Math.min(rect.x, bounds.width));
  const y = Math.max(0, Math.min(rect.y, bounds.height));
  const maxWidth = bounds.width - x;
  const maxHeight = bounds.height - y;
  const width = Math.max(0, Math.min(rect.width, maxWidth));
  const height = Math.max(0, Math.min(rect.height, maxHeight));
  return { x, y, width, height };
}
