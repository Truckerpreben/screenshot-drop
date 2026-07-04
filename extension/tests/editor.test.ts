import { describe, it, expect, beforeEach } from 'vitest';
import { AnnotationEditor } from '../src/core/editor';

function createStubCanvas() {
  const ctx = {
    canvas: { width: 10, height: 10 },
    clearRect: () => {},
    drawImage: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    stroke: () => {},
    strokeRect: () => {},
    fillText: () => {},
    strokeText: () => {},
    strokeStyle: '',
    fillStyle: '',
    font: '',
    textBaseline: '',
    imageSmoothingEnabled: true,
    lineWidth: 0,
    lineCap: '',
    lineJoin: ''
  };
  const canvas = {
    width: 10,
    height: 10,
    getContext: (kind: string) => (kind === '2d' ? ctx : null)
  };
  return canvas as unknown as HTMLCanvasElement;
}

const fakeImage = {} as CanvasImageSource;

describe('AnnotationEditor', () => {
  let editor: AnnotationEditor;

  beforeEach(() => {
    editor = new AnnotationEditor({ canvas: createStubCanvas(), image: fakeImage });
  });

  it('starts with the arrow tool and red color', () => {
    expect(editor.currentTool).toBe('arrow');
    expect(editor.currentColor).toBe('#e5484d');
  });

  it('setTool changes the active tool', () => {
    editor.setTool('pen');
    expect(editor.currentTool).toBe('pen');
  });

  it('setColor changes the active color', () => {
    editor.setColor('#3b82f6');
    expect(editor.currentColor).toBe('#3b82f6');
  });

  it('a pointer down/up cycle commits one annotation with start and end points', () => {
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 5, y: 5 });
    editor.pointerUp();
    expect(editor.annotations.length).toBe(1);
    expect(editor.annotations[0].points).toEqual([{ x: 0, y: 0 }, { x: 5, y: 5 }]);
  });

  it('pen tool accumulates every point moved through', () => {
    editor.setTool('pen');
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 1, y: 1 });
    editor.pointerMove({ x: 2, y: 2 });
    editor.pointerUp();
    expect(editor.annotations[0].points).toEqual([{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 2, y: 2 }]);
  });

  it('undo removes the last committed annotation', () => {
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    editor.undo();
    expect(editor.annotations.length).toBe(0);
  });

  it('clear removes all annotations', () => {
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerUp();
    editor.clear();
    expect(editor.annotations.length).toBe(0);
  });

  it('pointerMove before pointerDown is a no-op', () => {
    editor.pointerMove({ x: 9, y: 9 });
    editor.pointerUp();
    expect(editor.annotations.length).toBe(0);
  });

  it('defaults the stroke width to 3', () => {
    expect(editor.currentStrokeWidth).toBe(3);
  });

  it('a newly created annotation carries the current stroke width', () => {
    editor.setStrokeWidth(6);
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    expect(editor.annotations[0].width).toBe(6);
  });

  it('setStrokeWidth changes the width of subsequent annotations only', () => {
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerUp();
    editor.setStrokeWidth(8);
    editor.pointerDown({ x: 1, y: 1 });
    editor.pointerUp();
    expect(editor.annotations[0].width).toBe(3); // created before setStrokeWidth
    expect(editor.annotations[1].width).toBe(8);
  });

  it('clamps the stroke width to [1, 12]', () => {
    editor.setStrokeWidth(0);
    expect(editor.currentStrokeWidth).toBe(1);
    editor.setStrokeWidth(99);
    expect(editor.currentStrokeWidth).toBe(12);
  });

  it('text tool ignores pointer drags (text is click-placed via addText)', () => {
    editor.setTool('text');
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 5, y: 5 });
    editor.pointerUp();
    expect(editor.annotations.length).toBe(0);
  });

  it('addText commits a text annotation with the point, text, color, and width', () => {
    editor.setTool('text');
    editor.setColor('#3b82f6');
    editor.setStrokeWidth(4);
    editor.addText({ x: 7, y: 9 }, 'hello');
    expect(editor.annotations.length).toBe(1);
    expect(editor.annotations[0]).toEqual({
      tool: 'text',
      color: '#3b82f6',
      width: 4,
      points: [{ x: 7, y: 9 }],
      text: 'hello'
    });
  });

  it('addText with only whitespace commits nothing', () => {
    editor.addText({ x: 1, y: 1 }, '   ');
    expect(editor.annotations.length).toBe(0);
  });

  it('pixelate drag commits a two-point annotation carrying the current width', () => {
    editor.setTool('pixelate');
    editor.setStrokeWidth(5);
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 10, y: 10 });
    editor.pointerUp();
    expect(editor.annotations.length).toBe(1);
    expect(editor.annotations[0].tool).toBe('pixelate');
    expect(editor.annotations[0].points).toEqual([{ x: 0, y: 0 }, { x: 10, y: 10 }]);
    expect(editor.annotations[0].width).toBe(5);
  });

  it('undo removes a committed pixelate annotation', () => {
    editor.setTool('pixelate');
    editor.pointerDown({ x: 0, y: 0 });
    editor.pointerMove({ x: 10, y: 10 });
    editor.pointerUp();
    editor.undo();
    expect(editor.annotations.length).toBe(0);
  });
});
