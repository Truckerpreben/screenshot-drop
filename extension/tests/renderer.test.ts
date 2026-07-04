import { describe, it, expect } from 'vitest';
import { render, type PixelCanvasLike, type PixelCtxLike } from '../src/core/renderer';
import type { Annotation } from '../src/core/annotations';

function createStubCtx() {
  const calls: string[] = [];
  const props: Record<string, unknown> = { imageSmoothingEnabled: true };
  const drawImageCalls: Array<{ args: unknown[]; smoothing: unknown }> = [];
  const ctx = {
    canvas: { width: 100, height: 100 },
    clearRect: (...args: number[]) => calls.push(`clearRect:${args.join(',')}`),
    drawImage: (...args: unknown[]) => {
      calls.push('drawImage');
      drawImageCalls.push({ args, smoothing: props.imageSmoothingEnabled });
    },
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${x},${y}`),
    stroke: () => calls.push('stroke'),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    fillText: (text: string, x: number, y: number) => calls.push(`fillText:${text},${x},${y}`),
    strokeText: (text: string, x: number, y: number) => calls.push(`strokeText:${text},${x},${y}`),
    set strokeStyle(v: string) {
      props.strokeStyle = v;
    },
    get strokeStyle() {
      return props.strokeStyle as string;
    },
    set fillStyle(v: string) {
      props.fillStyle = v;
    },
    get fillStyle() {
      return props.fillStyle as string;
    },
    set font(v: string) {
      props.font = v;
    },
    get font() {
      return props.font as string;
    },
    set textBaseline(v: string) {
      props.textBaseline = v;
    },
    get textBaseline() {
      return props.textBaseline as string;
    },
    set imageSmoothingEnabled(v: boolean) {
      props.imageSmoothingEnabled = v;
    },
    get imageSmoothingEnabled() {
      return props.imageSmoothingEnabled as boolean;
    },
    set lineWidth(v: number) {
      props.lineWidth = v;
    },
    get lineWidth() {
      return props.lineWidth as number;
    },
    set lineCap(v: string) {
      props.lineCap = v;
    },
    get lineCap() {
      return props.lineCap as string;
    },
    set lineJoin(v: string) {
      props.lineJoin = v;
    },
    get lineJoin() {
      return props.lineJoin as string;
    }
  };
  return { ctx, calls, props, drawImageCalls };
}

// Records the canvases and draw calls a pixelate render makes through the
// injected createCanvas factory.
function createCanvasMock() {
  const created: Array<{ w: number; h: number }> = [];
  const canvases: unknown[] = [];
  const tmpDrawImageCalls: unknown[][] = [];
  const createCanvas = (w: number, h: number): PixelCanvasLike => {
    created.push({ w, h });
    const tctx: PixelCtxLike = {
      imageSmoothingEnabled: true,
      drawImage: (...args: unknown[]) => {
        tmpDrawImageCalls.push(args);
      }
    };
    const canvas: PixelCanvasLike = { width: w, height: h, getContext: () => tctx };
    canvases.push(canvas);
    return canvas;
  };
  return { createCanvas, created, canvases, tmpDrawImageCalls };
}

const fakeImage = {} as CanvasImageSource;

describe('render', () => {
  it('clears and draws the base image before any annotations', () => {
    const { ctx, calls } = createStubCtx();
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, []);
    expect(calls[0]).toBe('clearRect:0,0,100,100');
    expect(calls[1]).toBe('drawImage');
  });

  it('draws a rect annotation with strokeRect', () => {
    const { ctx, calls } = createStubCtx();
    const annotation: Annotation = { tool: 'rect', color: '#e5484d', points: [{ x: 5, y: 5 }, { x: 25, y: 15 }] };
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
    expect(calls).toContain('strokeRect:5,5,20,10');
  });

  it('draws a pen annotation as a connected polyline', () => {
    const { ctx, calls } = createStubCtx();
    const annotation: Annotation = {
      tool: 'pen',
      color: '#3b82f6',
      points: [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]
    };
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
    expect(calls).toContain('moveTo:0,0');
    expect(calls).toContain('lineTo:1,1');
    expect(calls).toContain('lineTo:2,2');
  });

  it('draws an arrow as a line plus two head strokes', () => {
    const { ctx, calls } = createStubCtx();
    const annotation: Annotation = { tool: 'arrow', color: '#e5484d', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] };
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
    const strokeCount = calls.filter((c) => c === 'stroke').length;
    expect(strokeCount).toBe(3); // shaft + two head segments
  });
});

describe('render stroke width', () => {
  it("sets ctx.lineWidth to the annotation's width", () => {
    const { ctx, props } = createStubCtx();
    const annotation: Annotation = {
      tool: 'rect',
      color: '#e5484d',
      width: 7,
      points: [{ x: 5, y: 5 }, { x: 25, y: 15 }]
    };
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
    expect(props.lineWidth).toBe(7);
  });

  it('falls back to 3 when width is undefined or 0', () => {
    const undefined0: Annotation[] = [
      { tool: 'rect', color: '#e5484d', points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] },
      { tool: 'rect', color: '#e5484d', width: 0, points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }
    ];
    for (const annotation of undefined0) {
      const { ctx, props } = createStubCtx();
      render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [annotation]);
      expect(props.lineWidth).toBe(3);
    }
  });

  it('scales the arrow head length with stroke width (subtle)', () => {
    function firstHeadLineToX(calls: string[]): number {
      const lineTos = calls.filter((c) => c.startsWith('lineTo:'));
      // lineTos[0] is the shaft end (100,0); lineTos[1] is the first head segment.
      return Number(lineTos[1].slice('lineTo:'.length).split(',')[0]);
    }
    const thin = createStubCtx();
    render(thin.ctx as unknown as CanvasRenderingContext2D, fakeImage, [
      { tool: 'arrow', color: '#e5484d', width: 1, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    ]);
    const thick = createStubCtx();
    render(thick.ctx as unknown as CanvasRenderingContext2D, fakeImage, [
      { tool: 'arrow', color: '#e5484d', width: 12, points: [{ x: 0, y: 0 }, { x: 100, y: 0 }] }
    ]);
    // headLen = 14 + width*2, and head x = 100 - headLen*cos(angle): wider stroke →
    // longer head → head point sits further from the tip (smaller x).
    expect(firstHeadLineToX(thick.calls)).toBeLessThan(firstHeadLineToX(thin.calls));
  });
});

describe('render text tool', () => {
  it('strokes the outline before filling, at the same coords, with the derived font and color', () => {
    const { ctx, calls, props } = createStubCtx();
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [
      { tool: 'text', color: '#3b82f6', width: 5, points: [{ x: 12, y: 34 }], text: 'Hi' }
    ]);
    const strokeIdx = calls.indexOf('strokeText:Hi,12,34');
    const fillIdx = calls.indexOf('fillText:Hi,12,34');
    expect(strokeIdx).toBeGreaterThanOrEqual(0);
    expect(fillIdx).toBeGreaterThan(strokeIdx); // outline first, fill on top
    expect(String(props.font)).toContain('23px'); // fontSize = 8 + 5*3
    expect(props.fillStyle).toBe('#3b82f6');
  });

  it('skips text annotations with no text', () => {
    const { ctx, calls } = createStubCtx();
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [
      { tool: 'text', color: '#3b82f6', width: 5, points: [{ x: 12, y: 34 }] }
    ]);
    expect(calls.some((c) => c.startsWith('fillText'))).toBe(false);
  });
});

describe('render pixelate tool', () => {
  const pixelate: Annotation = {
    tool: 'pixelate',
    color: '#000000',
    width: 3,
    points: [{ x: 10, y: 10 }, { x: 50, y: 30 }]
  };
  // region = clamp(normalize({10,10},{50,30})) = {10,10,40,20}; blockSize = max(4, 3*2) = 6;
  // grid = ceil(40/6), ceil(20/6) = 7, 4.

  it('downscales the clamped region into the pixel grid then upscales with smoothing off', () => {
    const { ctx, drawImageCalls, props } = createStubCtx();
    const mock = createCanvasMock();
    render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [pixelate], { createCanvas: mock.createCanvas });

    expect(mock.created[0]).toEqual({ w: 7, h: 4 });
    // tmp downscale: base image region -> full grid.
    expect(mock.tmpDrawImageCalls[0]).toEqual([fakeImage, 10, 10, 40, 20, 0, 0, 7, 4]);
    // main upscale: the tmp canvas grid -> region, drawn with smoothing disabled.
    const upscale = drawImageCalls.find((d) => d.args.length === 9);
    expect(upscale).toBeTruthy();
    expect(upscale!.args[0]).toBe(mock.canvases[0]);
    expect(upscale!.args.slice(1)).toEqual([0, 0, 7, 4, 10, 10, 40, 20]);
    expect(upscale!.smoothing).toBe(false);
    // smoothing restored to its prior value afterward.
    expect(props.imageSmoothingEnabled).toBe(true);
  });

  it('is a no-op (no throw, only the base image draw) when no createCanvas is provided', () => {
    const { ctx, drawImageCalls } = createStubCtx();
    expect(() =>
      render(ctx as unknown as CanvasRenderingContext2D, fakeImage, [pixelate])
    ).not.toThrow();
    expect(drawImageCalls.length).toBe(1); // only the base image
  });
});
