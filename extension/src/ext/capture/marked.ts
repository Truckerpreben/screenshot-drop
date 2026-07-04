import browser from '../browser';
import type { Rect } from '../../core/geometry';
import { scaleRect } from '../../core/geometry';

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

type Ctx2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/**
 * Gets a 2d context from a canvas that may be either an HTMLCanvasElement or
 * an OffscreenCanvas. TypeScript cannot call the overloaded `getContext`
 * directly on that union type (each side declares a different overload
 * list, so the union has no compatible call signature) — this casts the
 * receiver to a single concrete type first so the call type-checks.
 * (Duplicated from core/editor.ts's identical helper — see the plan's rule
 * to repeat code across tasks rather than add a cross-task import.)
 */
function get2DContext(canvas: HTMLCanvasElement | OffscreenCanvas): Ctx2D | null {
  return (canvas as HTMLCanvasElement).getContext('2d') as Ctx2D | null;
}

async function cropDataUrl(dataUrl: string, rect: Rect): Promise<string> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);

  let canvas: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== 'undefined') {
    canvas = new OffscreenCanvas(rect.width, rect.height);
  } else {
    canvas = document.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
  }
  const ctx = get2DContext(canvas);
  if (!ctx) throw new Error('cropDataUrl: could not get 2d context');
  ctx.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);

  if ('convertToBlob' in canvas) {
    const croppedBlob = await (canvas as OffscreenCanvas).convertToBlob({ type: 'image/png' });
    return blobToDataUrl(croppedBlob);
  }
  return (canvas as HTMLCanvasElement).toDataURL('image/png');
}

/** Injects the marquee overlay content script into the given tab. */
export async function injectMarqueeOverlay(tabId: number): Promise<void> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['overlay.content.js']
  });
}

/**
 * Captures the visible tab and crops it to the region the user marked.
 * Called from the top-level background listener once a 'region' message
 * arrives, so it works even if the service worker was evicted and re-woken
 * while the user was dragging (the drag rect/dpr travel in the message and
 * the windowId is read from persisted state — no in-memory promise needed).
 */
export async function captureMarkedRegion(windowId: number, rect: Rect, dpr: number): Promise<string> {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const deviceRect = scaleRect(rect, dpr);
  return cropDataUrl(dataUrl, deviceRect);
}
