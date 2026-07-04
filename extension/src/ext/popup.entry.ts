import browser from './browser';
import type { CaptureMessage, CaptureMode } from './messaging';

function bindButton(id: string, mode: CaptureMode): void {
  const button = document.getElementById(id);
  button?.addEventListener('click', async () => {
    const message: CaptureMessage = { type: 'capture', mode };
    await browser.runtime.sendMessage(message);
    window.close();
  });
}

bindButton('capture-full', 'full');
bindButton('capture-visible', 'visible');
bindButton('capture-marked', 'marked');
