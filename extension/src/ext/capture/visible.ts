import browser from '../browser';

/** Captures the visible area of the given window as a PNG data URL. */
export async function captureVisible(windowId: number): Promise<string> {
  return browser.tabs.captureVisibleTab(windowId, { format: 'png' });
}
