import { describe, it, expect } from 'vitest';
import { render } from '../src/core/renderer';
import type { Annotation } from '../src/core/annotations';

function createStubCtx() {
  const calls: string[] = [];
  const props: Record<string, unknown> = {};
  const ctx = {
    canvas: { width: 100, height: 100 },
    clearRect: (...args: number[]) => calls.push(`clearRect:${args.join(',')}`),
    drawImage: (..._args: unknown[]) => calls.push('drawImage'),
    beginPath: () => calls.push('beginPath'),
    moveTo: (x: number, y: number) => calls.push(`moveTo:${x},${y}`),
    lineTo: (x: number, y: number) => calls.push(`lineTo:${x},${y}`),
    stroke: () => calls.push('stroke'),
    strokeRect: (x: number, y: number, w: number, h: number) => calls.push(`strokeRect:${x},${y},${w},${h}`),
    set strokeStyle(v: string) {
      props.strokeStyle = v;
    },
    get strokeStyle() {
      return props.strokeStyle as string;
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
  return { ctx, calls, props };
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
