import browser from '../browser';
import { planScrollCapture, stitchTiles, type Tile } from '../../core/stitch';

declare const __TARGET__: 'chromium' | 'firefox';

interface DocumentSize {
  width: number;
  height: number;
  viewportHeight: number;
}

async function readDocumentSize(tabId: number): Promise<DocumentSize> {
  const [{ result }] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => ({
      width: document.documentElement.scrollWidth,
      height: document.documentElement.scrollHeight,
      viewportHeight: window.innerHeight
    })
  });
  return result as DocumentSize;
}

async function captureFullPageFirefox(tabId: number): Promise<string> {
  const size = await readDocumentSize(tabId);
  return (
    browser.tabs as unknown as {
      captureTab(
        tabId: number,
        opts: { rect: { x: number; y: number; width: number; height: number }; format: string }
      ): Promise<string>;
    }
  ).captureTab(tabId, {
    rect: { x: 0, y: 0, width: size.width, height: size.height },
    format: 'png'
  });
}

interface DebuggerLayoutMetrics {
  cssContentSize: { width: number; height: number };
}

async function captureFullPageChromiumViaDebugger(tabId: number): Promise<string> {
  const target = { tabId };
  await chrome.debugger.attach(target, '1.3');
  try {
    const metrics = (await chrome.debugger.sendCommand(target, 'Page.getLayoutMetrics')) as DebuggerLayoutMetrics;
    const { width, height } = metrics.cssContentSize;
    const result = (await chrome.debugger.sendCommand(target, 'Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 }
    })) as { data: string };
    return `data:image/png;base64,${result.data}`;
  } finally {
    await chrome.debugger.detach(target);
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function captureFullPageChromiumViaStitch(tabId: number, windowId: number): Promise<string> {
  const size = await readDocumentSize(tabId);
  const offsets = planScrollCapture(size.viewportHeight, size.height);

  const tiles: Tile[] = [];
  for (const offset of offsets) {
    await browser.scripting.executeScript({
      target: { tabId },
      func: (y: number) => window.scrollTo(0, y),
      args: [offset]
    });
    // 800ms (not 500) to stay under Chrome's ~2 captureVisibleTab/sec quota,
    // which the tighter interval sat exactly on and intermittently tripped.
    await new Promise((r) => setTimeout(r, 800));
    const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    tiles.push({ image: bitmap, y: offset });
  }

  const [{ result: dpr }] = await browser.scripting.executeScript({
    target: { tabId },
    func: () => window.devicePixelRatio
  });

  const canvas = new OffscreenCanvas(size.width * (dpr as number), size.height * (dpr as number));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('captureFullPageChromiumViaStitch: could not get 2d context');
  stitchTiles(ctx, tiles, size.width, size.height, dpr as number);

  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blobToDataUrl(blob);
}

/**
 * Captures the entire scrollable page, not just the viewport. Firefox uses
 * the native captureTab rect API; Chromium attaches the debugger protocol,
 * falling back to scroll-and-stitch if the debugger attach fails.
 */
export async function captureFullPage(tabId: number, windowId: number): Promise<string> {
  // if/else (rather than early return) so esbuild's constant-folding of the
  // __TARGET__ define drops the entire unused branch — this is what keeps the
  // Chromium-only chrome.debugger code out of the Firefox bundle and vice versa.
  if (__TARGET__ === 'firefox') {
    return captureFullPageFirefox(tabId);
  } else {
    try {
      return await captureFullPageChromiumViaDebugger(tabId);
    } catch (err) {
      console.warn('screenshot-drop: debugger capture failed, falling back to scroll-and-stitch', err);
      return captureFullPageChromiumViaStitch(tabId, windowId);
    }
  }
}
