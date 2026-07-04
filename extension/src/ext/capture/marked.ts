import browser from '../browser';
import type { Rect } from '../../core/geometry';
import { scaleRect } from '../../core/geometry';
import type { RegionMessage } from '../messaging';

/** Waits for a single 'region' message from the content script, then resolves its rect/dpr. */
function waitForRegion(): Promise<RegionMessage> {
  return new Promise((resolve) => {
    function listener(message: unknown) {
      const msg = message as RegionMessage;
      if (msg && msg.type === 'region') {
        browser.runtime.onMessage.removeListener(listener);
        resolve(msg);
      }
    }
    browser.runtime.onMessage.addListener(listener);
  });
}

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

/**
 * Injects the marquee overlay into tabId, waits for the user's drag, then
 * captures the visible tab and crops it to the marked region.
 */
export async function captureMarked(tabId: number, windowId: number): Promise<string> {
  await browser.scripting.executeScript({
    target: { tabId },
    files: ['overlay.content.js']
  });

  const region = await waitForRegion();
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const deviceRect = scaleRect(region.rect, region.dpr);
  return cropDataUrl(dataUrl, deviceRect);
}
