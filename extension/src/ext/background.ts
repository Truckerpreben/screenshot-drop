import browser from './browser';
import type { CaptureMessage } from './messaging';
import { captureStorageKey } from './messaging';
import { captureVisible } from './capture/visible';
import { captureMarked } from './capture/marked';
import { captureFullPage } from './capture/fullpage';

async function runCapture(mode: CaptureMessage['mode'], tab: { id?: number; windowId?: number }): Promise<string> {
  if (tab.windowId === undefined) throw new Error('background: active tab has no windowId');
  if (tab.id === undefined) throw new Error('background: active tab has no id');
  switch (mode) {
    case 'visible':
      return captureVisible(tab.windowId);
    case 'marked':
      return captureMarked(tab.id, tab.windowId);
    case 'full':
      return captureFullPage(tab.id, tab.windowId);
  }
}

browser.runtime.onMessage.addListener((message: unknown) => {
  const msg = message as CaptureMessage;
  if (!msg || msg.type !== 'capture') return undefined;

  return (async () => {
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tab) throw new Error('background: no active tab');

    try {
      const dataUrl = await runCapture(msg.mode, tab);
      const id = crypto.randomUUID();
      await browser.storage.session.set({ [captureStorageKey(id)]: dataUrl });
      await browser.tabs.create({ url: `annotate.html?id=${id}` });
    } catch (err) {
      console.error('screenshot-drop: capture failed', err);
    }
  })();
});
