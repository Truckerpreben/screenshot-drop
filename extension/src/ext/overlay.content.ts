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

  // A small dark chip showing the live selection size in CSS px. As a child of
  // the overlay it is torn down automatically whenever removeOverlay() runs
  // (mouseup, Escape) — no separate cleanup needed.
  const label = document.createElement('div');
  Object.assign(label.style, {
    position: 'fixed',
    display: 'none',
    padding: '2px 6px',
    background: 'rgba(0, 0, 0, 0.75)',
    color: '#fff',
    font: '12px ui-monospace, SFMono-Regular, Menlo, monospace',
    borderRadius: '3px',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
    zIndex: '2147483647'
  });
  overlay.appendChild(label);
  document.documentElement.appendChild(overlay);

  let start: { x: number; y: number } | null = null;

  /** Places the label near the cursor, offset so it isn't hidden under the pointer, clamped to the viewport. */
  function positionLabel(px: number, py: number): void {
    const offset = 12;
    const rect = label.getBoundingClientRect();
    let lx = px + offset;
    let ly = py + offset;
    if (lx + rect.width > window.innerWidth) lx = px - offset - rect.width;
    if (ly + rect.height > window.innerHeight) ly = py - offset - rect.height;
    label.style.left = `${Math.max(0, lx)}px`;
    label.style.top = `${Math.max(0, ly)}px`;
  }

  function onMouseDown(e: MouseEvent): void {
    start = { x: e.clientX, y: e.clientY };
    marquee.style.display = 'block';
    label.textContent = '0 × 0';
    label.style.display = 'block';
    positionLabel(e.clientX, e.clientY);
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
    label.textContent = `${width} × ${height}`;
    positionLabel(e.clientX, e.clientY);
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
