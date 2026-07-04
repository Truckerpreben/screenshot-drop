import type { Rect } from '../core/geometry';

export type CaptureMode = 'visible' | 'full' | 'marked';

export interface CaptureMessage {
  type: 'capture';
  mode: CaptureMode;
}

export interface RegionMessage {
  type: 'region';
  rect: Rect;
  dpr: number;
}

export interface GetCaptureMessage {
  type: 'get-capture';
  id: string;
}

export type ExtensionMessage = CaptureMessage | RegionMessage | GetCaptureMessage;

export const CAPTURE_STORAGE_PREFIX = 'capture:';

export function captureStorageKey(id: string): string {
  return `${CAPTURE_STORAGE_PREFIX}${id}`;
}
