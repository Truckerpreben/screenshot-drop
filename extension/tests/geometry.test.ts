import { describe, it, expect } from 'vitest';
import { normalizeRect, scaleRect, arrowHead, clampRectToBounds, pixelGrid } from '../src/core/geometry';

describe('normalizeRect', () => {
  it('normalizes a rect dragged bottom-right to top-left', () => {
    const rect = normalizeRect({ x: 50, y: 50 }, { x: 10, y: 20 });
    expect(rect).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });

  it('normalizes a rect dragged top-left to bottom-right', () => {
    const rect = normalizeRect({ x: 10, y: 20 }, { x: 50, y: 50 });
    expect(rect).toEqual({ x: 10, y: 20, width: 40, height: 30 });
  });
});

describe('scaleRect', () => {
  it('scales all fields by dpr', () => {
    const rect = scaleRect({ x: 10, y: 20, width: 30, height: 40 }, 2);
    expect(rect).toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });
});

describe('arrowHead', () => {
  it('returns two points near the arrow tip for a horizontal arrow', () => {
    const [left, right] = arrowHead({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, Math.PI / 6);
    expect(left.x).toBeCloseTo(100 - 10 * Math.cos(Math.PI / 6));
    expect(left.y).toBeCloseTo(-10 * Math.sin(Math.PI / 6));
    expect(right.x).toBeCloseTo(100 - 10 * Math.cos(Math.PI / 6));
    expect(right.y).toBeCloseTo(10 * Math.sin(Math.PI / 6));
  });
});

describe('clampRectToBounds', () => {
  it('leaves an in-bounds rect unchanged', () => {
    const rect = clampRectToBounds({ x: 10, y: 10, width: 20, height: 20 }, { width: 100, height: 100 });
    expect(rect).toEqual({ x: 10, y: 10, width: 20, height: 20 });
  });

  it('clamps a rect that overflows the bounds', () => {
    const rect = clampRectToBounds({ x: 90, y: 90, width: 50, height: 50 }, { width: 100, height: 100 });
    expect(rect).toEqual({ x: 90, y: 90, width: 10, height: 10 });
  });

  it('clamps negative origin into bounds', () => {
    const rect = clampRectToBounds({ x: -10, y: -10, width: 20, height: 20 }, { width: 100, height: 100 });
    expect(rect).toEqual({ x: 0, y: 0, width: 20, height: 20 });
  });
});

describe('pixelGrid', () => {
  it('divides evenly for a clean divisor', () => {
    expect(pixelGrid({ x: 0, y: 0, width: 100, height: 50 }, 10)).toEqual({ cols: 10, rows: 5 });
  });

  it('ceils the count when the dimension is not a multiple of the block size', () => {
    expect(pixelGrid({ x: 0, y: 0, width: 105, height: 52 }, 10)).toEqual({ cols: 11, rows: 6 });
  });

  it('treats a block size below 1 as 1', () => {
    expect(pixelGrid({ x: 0, y: 0, width: 4, height: 4 }, 0)).toEqual({ cols: 4, rows: 4 });
  });

  it('returns at least 1 column and row for a zero-size rect', () => {
    expect(pixelGrid({ x: 0, y: 0, width: 0, height: 0 }, 8)).toEqual({ cols: 1, rows: 1 });
  });
});
