import { describe, it, expect } from 'vitest';
import { AnnotationState, type Annotation } from '../src/core/annotations';

function makeArrow(): Annotation {
  return { tool: 'arrow', color: '#e5484d', points: [{ x: 0, y: 0 }, { x: 10, y: 10 }] };
}

describe('AnnotationState', () => {
  it('starts empty', () => {
    const state = new AnnotationState();
    expect(state.annotations).toEqual([]);
  });

  it('adds annotations in order', () => {
    const state = new AnnotationState();
    const a = makeArrow();
    const b: Annotation = { tool: 'pen', color: '#3b82f6', points: [{ x: 1, y: 1 }] };
    state.add(a);
    state.add(b);
    expect(state.annotations).toEqual([a, b]);
  });

  it('undo removes the most recently added annotation', () => {
    const state = new AnnotationState();
    state.add(makeArrow());
    state.add(makeArrow());
    state.undo();
    expect(state.annotations.length).toBe(1);
  });

  it('undo on empty state is a no-op', () => {
    const state = new AnnotationState();
    state.undo();
    expect(state.annotations).toEqual([]);
  });

  it('clear removes all annotations', () => {
    const state = new AnnotationState();
    state.add(makeArrow());
    state.add(makeArrow());
    state.clear();
    expect(state.annotations).toEqual([]);
  });
});
