import browser from './browser';
import type { CaptureMessage, CaptureMode } from './messaging';

/**
 * Wires a capture-mode button. Behavior is unchanged from the reviewed version:
 * clicking sends a single {type:'capture', mode} runtime message, then closes
 * the popup so the background can drive the capture.
 */
function bindCapture(id: string, mode: CaptureMode): void {
  const button = document.getElementById(id);
  button?.addEventListener('click', async () => {
    const message: CaptureMessage = { type: 'capture', mode };
    await browser.runtime.sendMessage(message);
    window.close();
  });
}

bindCapture('capture-full', 'full');
bindCapture('capture-visible', 'visible');
bindCapture('capture-marked', 'marked');

// Navigation affordance: open the destinations manager (options page).
document.getElementById('open-options')?.addEventListener('click', () => {
  browser.runtime.openOptionsPage();
  window.close();
});
