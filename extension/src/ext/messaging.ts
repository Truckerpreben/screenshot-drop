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

export interface RegionCancelledMessage {
  type: 'region-cancelled';
}

export interface GetCaptureMessage {
  type: 'get-capture';
  id: string;
}

export type ExtensionMessage = CaptureMessage | RegionMessage | RegionCancelledMessage | GetCaptureMessage;

export const CAPTURE_STORAGE_PREFIX = 'capture:';

export function captureStorageKey(id: string): string {
  return `${CAPTURE_STORAGE_PREFIX}${id}`;
}

export const PENDING_MARKED_PREFIX = 'pending-marked:';

/** session-storage key under which an in-flight marked capture's state is persisted per tab. */
export function pendingMarkedKey(tabId: number): string {
  return `${PENDING_MARKED_PREFIX}${tabId}`;
}

/**
 * State persisted while a marked-area capture is awaiting the user's drag.
 * Survives an MV3 service-worker eviction so the re-woken worker can finish
 * the capture when the 'region' message finally arrives.
 */
export interface PendingMarked {
  windowId: number;
}
