import browser from './browser';
import type { RegionMessage, RegionCancelledMessage } from './messaging';

const OVERLAY_ID = 'snapdrop-overlay-marquee';

function removeOverlay(): void {
  document.getElementById(OVERLAY_ID)?.remove();
}

function installOverlay(): void {
  removeOverlay();

  const overlay = document.createElement('div');
  overlay.id = OVERLAY_ID;
  Object.assign(overlay.style, {
    position: 'fixed',
    inset: '0',
    zIndex: '2147483647',
    cursor: 'crosshair',
    background: 'rgba(0, 0, 0, 0.3)'
  });

  const marquee = document.createElement('div');
  Object.assign(marquee.style, {
    position: 'fixed',
    border: '2px dashed #fff',
    display: 'none'
  });
  overlay.appendChild(marquee);
  document.documentElement.appendChild(overlay);

  let start: { x: number; y: number } | null = null;

  function onMouseDown(e: MouseEvent): void {
    start = { x: e.clientX, y: e.clientY };
    marquee.style.display = 'block';
  }

  function onMouseMove(e: MouseEvent): void {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const width = Math.abs(e.clientX - start.x);
    const height = Math.abs(e.clientY - start.y);
    Object.assign(marquee.style, {
      left: `${x}px`,
      top: `${y}px`,
      width: `${width}px`,
      height: `${height}px`
    });
  }

  async function onMouseUp(e: MouseEvent): Promise<void> {
    if (!start) return;
    const x = Math.min(start.x, e.clientX);
    const y = Math.min(start.y, e.clientY);
    const width = Math.abs(e.clientX - start.x);
    const height = Math.abs(e.clientY - start.y);
    const dpr = window.devicePixelRatio;
    start = null;

    removeOverlay();
    document.removeEventListener('keydown', onKeyDown);
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));

    const message: RegionMessage = { type: 'region', rect: { x, y, width, height }, dpr };
    await browser.runtime.sendMessage(message);
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      removeOverlay();
      document.removeEventListener('keydown', onKeyDown);
      // Tell the background to drop the persisted "awaiting region" state so a
      // cancelled marquee doesn't leave a dangling pending-marked entry.
      const message: RegionCancelledMessage = { type: 'region-cancelled' };
      void browser.runtime.sendMessage(message);
    }
  }

  overlay.addEventListener('mousedown', onMouseDown);
  overlay.addEventListener('mousemove', onMouseMove);
  overlay.addEventListener('mouseup', onMouseUp);
  document.addEventListener('keydown', onKeyDown);
}

installOverlay();
