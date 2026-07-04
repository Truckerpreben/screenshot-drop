import browser from './browser';
import { AnnotationEditor } from '../core/editor';
import { TOOLS, toolForKey, nextColor } from '../core/tools';
import { captureStorageKey } from './messaging';
import { HttpTransport } from '../platform/transport-http';
import { UploadError } from '../platform/transport';
import { WebextStore } from '../platform/store-webext';
import type { Destination } from '../platform/transport';

/**
 * Inline SVG glyphs for the toolbar tool buttons, keyed by tool id. Inlined as
 * markup (not remote assets) to satisfy the MV3 CSP; sizing/color come from CSS.
 */
const TOOL_ICONS: Record<string, string> = {
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>',
  rect:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/></svg>',
  line:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="18" x2="18" y2="6"/><circle cx="6" cy="18" r="1.7"/><circle cx="18" cy="6" r="1.7"/></svg>',
  pen:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>'
};

function getCaptureId(): string {
  const params = new URLSearchParams(window.location.search);
  const id = params.get('id');
  if (!id) throw new Error('annotate: missing ?id= in URL');
  return id;
}

async function loadCapture(id: string): Promise<string> {
  const key = captureStorageKey(id);
  const result = await browser.storage.session.get(key);
  const dataUrl = result[key] as string | undefined;
  if (!dataUrl) throw new Error('annotate: capture not found in session storage');
  await browser.storage.session.remove(key);
  return dataUrl;
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('annotate: could not decode captured image'));
    img.src = dataUrl;
  });
}

function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('visible');
  setTimeout(() => toast.classList.remove('visible'), 4000);
}

/**
 * Renders a terminal error state: hides the editing UI and shows a single
 * centered message. Used when there's no capture to annotate (page opened
 * directly, session entry expired) or the background reported a capture error.
 */
function showFatal(message: string): void {
  for (const id of ['toolbar', 'color-toggle', 'undo', 'clear', 'canvas', 'save-bar', 'toast']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
  let fatal = document.getElementById('fatal');
  if (!fatal) {
    fatal = document.createElement('div');
    fatal.id = 'fatal';
    document.body.appendChild(fatal);
  }
  fatal.textContent = message;
}

async function populateDestinations(select: HTMLSelectElement, store: WebextStore): Promise<void> {
  const destinations = await store.list();
  select.innerHTML = '';
  for (const dest of destinations) {
    const option = document.createElement('option');
    option.value = dest.id;
    option.textContent = dest.name;
    select.appendChild(option);
  }
  const lastUsedId = await store.getLastUsedId();
  if (lastUsedId) select.value = lastUsedId;
}

function toCanvasPoint(canvas: HTMLCanvasElement, e: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
}

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const errorParam = params.get('error');
  if (errorParam) {
    showFatal(errorParam);
    return;
  }

  let image: HTMLImageElement;
  try {
    const id = getCaptureId();
    const dataUrl = await loadCapture(id);
    image = await loadImage(dataUrl);
  } catch (err) {
    console.error('screenshot-drop: could not load capture', err);
    showFatal('Capture not found or expired — take a new screenshot.');
    return;
  }

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const editor = new AnnotationEditor({ canvas, image });

  const toolbar = document.getElementById('toolbar') as HTMLElement;
  const toolButtons = new Map<string, HTMLButtonElement>();

  // Reflects the editor's current tool onto the buttons as visual + ARIA state.
  // Presentation only — it reads editor.currentTool and never alters tool logic.
  const refreshActiveTool = (): void => {
    const active = editor.currentTool;
    for (const [id, btn] of toolButtons) {
      const isActive = id === active;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
  };

  for (const tool of TOOLS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'tool-btn';
    button.dataset.tool = tool.id;
    button.title = `${tool.label} (${tool.key})`;
    button.setAttribute('aria-label', `${tool.label} (key ${tool.key})`);
    button.setAttribute('aria-pressed', 'false');
    button.innerHTML = `${TOOL_ICONS[tool.id] ?? ''}<span class="tool-btn__key" aria-hidden="true">${tool.key}</span>`;
    button.addEventListener('click', () => {
      editor.setTool(tool.id);
      refreshActiveTool();
    });
    toolbar.appendChild(button);
    toolButtons.set(tool.id, button);
  }
  refreshActiveTool();

  const colorButton = document.getElementById('color-toggle') as HTMLButtonElement;
  colorButton.style.backgroundColor = editor.currentColor;
  colorButton.addEventListener('click', () => {
    editor.setColor(nextColor(editor.currentColor));
    colorButton.style.backgroundColor = editor.currentColor;
  });

  const undo = () => editor.undo();
  document.getElementById('undo')?.addEventListener('click', undo);
  document.getElementById('clear')?.addEventListener('click', () => editor.clear());

  canvas.addEventListener('pointerdown', (e) => editor.pointerDown(toCanvasPoint(canvas, e)));
  canvas.addEventListener('pointermove', (e) => editor.pointerMove(toCanvasPoint(canvas, e)));
  canvas.addEventListener('pointerup', () => editor.pointerUp());

  const store = new WebextStore(browser.storage.local);
  const select = document.getElementById('destination') as HTMLSelectElement;
  await populateDestinations(select, store);

  const shortnameInput = document.getElementById('shortname') as HTMLInputElement;
  const saveButton = document.getElementById('save') as HTMLButtonElement;

  document.addEventListener('keydown', (e) => {
    // Don't fire editor shortcuts while typing in a text field, select, or
    // contenteditable — let the browser handle the keystroke (incl. its own undo).
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;

    // Ctrl+Z / Cmd+Z undoes the most recent annotation.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      undo();
      return;
    }
    // Don't hijack other modified keystrokes (Ctrl+C copy, Ctrl+1 tab switch, etc.).
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tool = toolForKey(e.key);
    if (tool) {
      editor.setTool(tool);
      refreshActiveTool();
    }
    if (e.key === 'c') {
      editor.setColor(nextColor(editor.currentColor));
      colorButton.style.backgroundColor = editor.currentColor;
    }
  });

  saveButton.addEventListener('click', async () => {
    const destinations = await store.list();
    const dest = destinations.find((d: Destination) => d.id === select.value);
    if (!dest) {
      showToast('No destination selected — add one in Options.');
      return;
    }

    // Prevent a double-click from uploading twice (which saves a -2 duplicate).
    saveButton.disabled = true;
    try {
      const blob = await editor.toBlob();
      const transport = new HttpTransport();
      const result = await transport.upload(dest, blob, shortnameInput.value);
      await store.setLastUsedId(dest.id);
      // The upload succeeded — always report success. The clipboard copy is a
      // best-effort convenience; if it fails (e.g. the Save-click's user
      // activation expired during the round-trip) the file is still saved.
      showToast(`Saved: ${result.path}`);
      try {
        await navigator.clipboard.writeText(result.path);
        showToast(`Saved: ${result.path} (copied to clipboard)`);
      } catch (clipErr) {
        showToast(`Saved: ${result.path} (copy the path above manually)`);
        console.error('screenshot-drop: clipboard write failed', clipErr);
      }
    } catch (err) {
      if (err instanceof UploadError) {
        if (err.kind === 'auth') showToast('Auth failed — check the token in Options.');
        else if (err.kind === 'network') showToast('Could not reach the destination service.');
        else if (err.kind === 'server') showToast('Destination service returned an error.');
        else showToast('Destination service returned an unexpected response.');
      } else {
        showToast('Save failed — see console for details.');
      }
      console.error('screenshot-drop: save failed', err);
    } finally {
      saveButton.disabled = false;
    }
  });
}

main().catch((err) => {
  console.error('screenshot-drop: annotate init failed', err);
});
