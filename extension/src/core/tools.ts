import type { ToolKind } from './annotations';

export interface ToolDef {
  id: ToolKind;
  label: string;
  key: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'arrow', label: 'Arrow', key: '1' },
  { id: 'rect', label: 'Rectangle', key: '2' },
  { id: 'line', label: 'Line', key: '3' },
  { id: 'pen', label: 'Pen', key: '4' }
];

export const COLORS = ['#e5484d', '#3b82f6'] as const;
export type ColorValue = (typeof COLORS)[number];

/** Looks up the tool bound to a keyboard key ('1'-'4'), or undefined. */
export function toolForKey(key: string): ToolKind | undefined {
  return TOOLS.find((t) => t.key === key)?.id;
}

/** Returns the color that follows `current` in the COLORS cycle (the 'c' key toggles). */
export function nextColor(current: string): ColorValue {
  const idx = COLORS.indexOf(current as ColorValue);
  const nextIdx = idx === -1 ? 0 : (idx + 1) % COLORS.length;
  return COLORS[nextIdx];
}
