import type { Runtime } from 'webextension-polyfill';
import browser from './browser';
import type { CaptureMessage, CaptureMode, ExtensionMessage, RegionMessage, PendingMarked } from './messaging';
import { captureStorageKey, pendingMarkedKey } from './messaging';
import { captureVisible } from './capture/visible';
import { injectMarqueeOverlay, captureMarkedRegion } from './capture/marked';
import { captureFullPage } from './capture/fullpage';

/** storage.local key holding the last capture mode used, for the global hotkey. */
const LAST_MODE_KEY = 'lastMode';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** Stores a finished capture in session storage and opens the annotate tab for it. */
async function handoffCapture(dataUrl: string): Promise<void> {
  const id = crypto.randomUUID();
  await browser.storage.session.set({ [captureStorageKey(id)]: dataUrl });
  await browser.tabs.create({ url: `annotate.html?id=${id}` });
}

/**
 * Surfaces a capture failure to the user. The popup that triggered the capture
 * has already closed, so a thrown error would otherwise be invisible (common on
 * chrome:// pages or when debugger attach is denied). Prefer a notification;
 * fall back to opening the annotate tab with an ?error= param.
 */
async function reportCaptureError(message: string): Promise<void> {
  if (browser.notifications?.create) {
    try {
      await browser.notifications.create({
        type: 'basic',
        iconUrl: browser.runtime.getURL('icons/icon48.png'),
        title: 'Screenshot Drop',
        message: `Capture failed: ${message}`
      });
      return;
    } catch {
      // notifications unavailable at runtime — fall through to the tab fallback
    }
  }
  await browser.tabs.create({ url: `annotate.html?error=${encodeURIComponent(message)}` });
}

/** Runs a non-interactive capture. 'marked' is handled via the region round-trip, not here. */
async function runDirectCapture(mode: 'visible' | 'full', tab: { id: number; windowId: number }): Promise<string> {
  if (mode === 'visible') {
    return captureVisible(tab.windowId);
  }
  return captureFullPage(tab.id, tab.windowId);
}

async function onCapture(mode: CaptureMessage['mode']): Promise<void> {
  // Remember the mode so the global hotkey can repeat the user's last choice.
  await browser.storage.local.set({ [LAST_MODE_KEY]: mode });

  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab || tab.id === undefined || tab.windowId === undefined) {
    throw new Error('background: no active tab with an id and windowId');
  }

  if (mode === 'marked') {
    // Persist "awaiting region" state BEFORE injecting the overlay. If the
    // service worker is evicted while the user hesitates mid-drag, the
    // re-woken worker recovers this state when the 'region' message arrives.
    const pending: PendingMarked = { windowId: tab.windowId };
    await browser.storage.session.set({ [pendingMarkedKey(tab.id)]: pending });
    await injectMarqueeOverlay(tab.id);
    return;
  }

  const dataUrl = await runDirectCapture(mode, { id: tab.id, windowId: tab.windowId });
  await handoffCapture(dataUrl);
}

async function onRegion(tabId: number, region: RegionMessage): Promise<void> {
  const key = pendingMarkedKey(tabId);
  const stored = await browser.storage.session.get(key);
  const pending = stored[key] as PendingMarked | undefined;
  if (!pending) {
    // No marked capture is in progress for this tab (stale or duplicate message).
    return;
  }
  await browser.storage.session.remove(key);
  const dataUrl = await captureMarkedRegion(pending.windowId, region.rect, region.dpr);
  await handoffCapture(dataUrl);
}

async function onRegionCancelled(tabId: number): Promise<void> {
  await browser.storage.session.remove(pendingMarkedKey(tabId));
}

/** Runs a capture using the last-used mode, defaulting to 'visible' when unset. */
async function onHotkeyCapture(): Promise<void> {
  const stored = await browser.storage.local.get(LAST_MODE_KEY);
  const mode = (stored[LAST_MODE_KEY] as CaptureMode | undefined) ?? 'visible';
  await onCapture(mode);
}

// Registered at module load so the MV3 service worker can be woken by the
// keyboard command even after it has been evicted.
browser.commands.onCommand.addListener((command: string) => {
  if (command !== 'capture-last-mode') return;
  void onHotkeyCapture().catch((err) => reportCaptureError(errorMessage(err)));
});

browser.runtime.onMessage.addListener((message: unknown, sender: Runtime.MessageSender) => {
  const msg = message as ExtensionMessage;
  if (!msg || typeof msg !== 'object') return undefined;

  if (msg.type === 'capture') {
    // Returning the promise keeps the worker alive until the capture (or, for
    // 'marked', the overlay injection) settles.
    return onCapture(msg.mode).catch((err) => reportCaptureError(errorMessage(err)));
  }

  if (msg.type === 'region') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return undefined;
    return onRegion(tabId, msg).catch((err) => reportCaptureError(errorMessage(err)));
  }

  if (msg.type === 'region-cancelled') {
    const tabId = sender.tab?.id;
    if (tabId === undefined) return undefined;
    return onRegionCancelled(tabId);
  }

  return undefined;
});
