import { describe, it, expect } from 'vitest';
import { planScrollCapture, stitchTiles, type Tile } from '../src/core/stitch';

describe('planScrollCapture', () => {
  it('returns a single offset when the page fits in one viewport', () => {
    expect(planScrollCapture(800, 800)).toEqual([0]);
    expect(planScrollCapture(800, 500)).toEqual([0]);
  });

  it('returns [0] without hanging when the viewport height is zero', () => {
    expect(planScrollCapture(0, 1000)).toEqual([0]);
  });

  it('handles a page height that is an exact multiple of the viewport height', () => {
    expect(planScrollCapture(500, 1500)).toEqual([0, 500, 1000]);
  });

  it('adds a final partial-tile offset for non-evenly-divisible pages', () => {
    expect(planScrollCapture(500, 1200)).toEqual([0, 500, 700]);
  });

  it('does not duplicate the final offset when it already lands on a step', () => {
    const offsets = planScrollCapture(400, 1600);
    expect(offsets).toEqual([0, 400, 800, 1200]);
    expect(new Set(offsets).size).toBe(offsets.length);
  });
});

describe('stitchTiles', () => {
  function createStubCtx() {
    const calls: string[] = [];
    const canvas = { width: 0, height: 0 };
    const ctx = {
      canvas,
      drawImage: (_img: unknown, x: number, y: number) => calls.push(`drawImage:${x},${y}`)
    };
    return { ctx: ctx as unknown as CanvasRenderingContext2D, canvas, calls };
  }

  it('resizes the canvas to totalWidth/height scaled by dpr', () => {
    const { ctx, canvas } = createStubCtx();
    stitchTiles(ctx, [], 400, 900, 2);
    expect(canvas.width).toBe(800);
    expect(canvas.height).toBe(1800);
  });

  it('draws each tile at its y offset scaled by dpr', () => {
    const { ctx, calls } = createStubCtx();
    const tiles: Tile[] = [
      { image: {} as CanvasImageSource, y: 0 },
      { image: {} as CanvasImageSource, y: 500 }
    ];
    stitchTiles(ctx, tiles, 400, 1000, 2);
    expect(calls).toEqual(['drawImage:0,0', 'drawImage:0,1000']);
  });
});
