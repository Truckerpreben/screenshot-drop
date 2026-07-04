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
    strokeStyle: '',
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
});
