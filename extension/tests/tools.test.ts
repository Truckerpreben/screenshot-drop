import { describe, it, expect } from 'vitest';
import { TOOLS, COLORS, toolForKey, nextColor } from '../src/core/tools';

describe('TOOLS', () => {
  it('defines four tools bound to keys 1-4', () => {
    expect(TOOLS.map((t) => t.key)).toEqual(['1', '2', '3', '4']);
  });
});

describe('toolForKey', () => {
  it('resolves a known key to its tool id', () => {
    expect(toolForKey('2')).toBe('rect');
  });

  it('returns undefined for an unbound key', () => {
    expect(toolForKey('9')).toBeUndefined();
  });
});

describe('nextColor', () => {
  it('cycles from red to blue', () => {
    expect(nextColor(COLORS[0])).toBe(COLORS[1]);
  });

  it('cycles from blue back to red', () => {
    expect(nextColor(COLORS[1])).toBe(COLORS[0]);
  });

  it('defaults to the first color for an unknown current value', () => {
    expect(nextColor('#unknown')).toBe(COLORS[0]);
  });
});
