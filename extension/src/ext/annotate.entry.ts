import browser from './browser';
import { AnnotationEditor } from '../core/editor';
import { TOOLS, toolForKey, nextColor } from '../core/tools';
import { captureStorageKey } from './messaging';
import { HttpTransport } from '../platform/transport-http';
import { UploadError } from '../platform/transport';
import { WebextStore } from '../platform/store-webext';
import type { Destination } from '../platform/transport';

/**
 * Inline SVG glyphs, keyed by tool id, for the toolbar buttons. Inlined as
 * markup (not remote assets) to satisfy the MV3 CSP; size/color come from CSS.
 */
const TOOL_ICONS: Record<string, string> = {
  arrow:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>',
  rect: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="14" rx="2"/></svg>',
  line: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="6" y1="18" x2="18" y2="6"/><circle cx="6" cy="18" r="1.7"/><circle cx="18" cy="6" r="1.7"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 5h14"/><path d="M12 5v14"/><path d="M9 19h6"/></svg>',
  pixelate:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18M3 9h18M3 15h18"/><rect x="3.7" y="3.7" width="4.6" height="4.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="15.7" y="9.7" width="4.6" height="4.6" rx="0.5" fill="currentColor" stroke="none"/><rect x="9.7" y="15.7" width="4.6" height="4.6" rx="0.5" fill="currentColor" stroke="none"/></svg>'
};

const SEND_ICON =
  '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>';

type ToastVariant = 'success' | 'error' | 'info';

const TOAST_ICONS: Record<ToastVariant, string> = {
  success:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4 4 10-10"/></svg>',
  error:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 11v5M12 7.5h.01"/></svg>'
};

const FATAL_ICON =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M8 3h11a2 2 0 0 1 2 2v11M21 21H5a2 2 0 0 1-2-2V5"/><path d="M15 8.5a1 1 0 1 1-1-1"/></svg>';

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

let toastTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * Shows a transient toast. The `variant` only affects the icon/color; the
 * message text and ~4s auto-dismiss are unchanged from the reviewed behavior.
 */
function showToast(message: string, variant: ToastVariant = 'info'): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.dataset.variant = variant;
  toast.innerHTML = `<span class="toast__icon" aria-hidden="true">${TOAST_ICONS[variant]}</span><span class="toast__msg"></span>`;
  const msgEl = toast.querySelector('.toast__msg') as HTMLElement | null;
  if (msgEl) msgEl.textContent = message;
  toast.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('visible'), 4000);
}

/**
 * Renders a terminal error state: hides the editing UI and shows a single
 * centered card. Used when there's no capture to annotate (page opened
 * directly, session entry expired) or the background reported a capture error.
 */
function showFatal(message: string): void {
  document.body.classList.add('is-fatal');
  let fatal = document.getElementById('fatal');
  if (!fatal) {
    fatal = document.createElement('div');
    fatal.id = 'fatal';
    fatal.className = 'fatal';
    fatal.setAttribute('role', 'alert');
    fatal.innerHTML = `<div class="fatal__icon" aria-hidden="true">${FATAL_ICON}</div><p class="fatal__title">Can't open the editor</p><p class="fatal__msg"></p>`;
    document.body.appendChild(fatal);
  }
  const msgEl = fatal.querySelector('.fatal__msg') as HTMLElement | null;
  if (msgEl) msgEl.textContent = message;
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

  // Pixelate needs a scratch canvas to sample/redact; without this factory the
  // renderer's pixelate pass silently no-ops.
  const editor = new AnnotationEditor({
    canvas,
    image,
    createCanvas: (w, h) => {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    }
  });

  const colorButton = document.getElementById('color-toggle') as HTMLButtonElement;
  const toolbar = document.getElementById('toolbar') as HTMLElement;
  const toolButtons = new Map<string, HTMLButtonElement>();

  // Reflects the editor's current tool onto the buttons as visual + ARIA state,
  // and dims the color swatch for tools that don't draw in color (pixelate).
  // Presentation only — it reads editor.currentTool and never alters tool logic.
  const refreshActiveTool = (): void => {
    const active = editor.currentTool;
    for (const [id, btn] of toolButtons) {
      const isActive = id === active;
      btn.classList.toggle('is-active', isActive);
      btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }
    const usesColor = TOOLS.find((t) => t.id === active)?.usesColor !== false;
    colorButton.disabled = !usesColor;
    colorButton.setAttribute('aria-disabled', usesColor ? 'false' : 'true');
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

  colorButton.style.backgroundColor = editor.currentColor;
  colorButton.addEventListener('click', () => {
    editor.setColor(nextColor(editor.currentColor));
    colorButton.style.backgroundColor = editor.currentColor;
  });

  // Stroke-thickness slider. Reads editor.currentStrokeWidth for its initial
  // position, then pushes changes forward; width is stamped per-annotation at
  // creation, so this affects subsequent strokes only.
  const strokeInput = document.getElementById('stroke-width') as HTMLInputElement;
  const strokeValue = document.getElementById('stroke-width-val');
  const syncStroke = (): void => {
    if (strokeValue) strokeValue.textContent = String(editor.currentStrokeWidth);
  };
  strokeInput.value = String(editor.currentStrokeWidth);
  syncStroke();
  strokeInput.addEventListener('input', () => {
    editor.setStrokeWidth(Number(strokeInput.value));
    syncStroke();
  });

  const undo = () => editor.undo();
  document.getElementById('undo')?.addEventListener('click', undo);
  document.getElementById('clear')?.addEventListener('click', () => editor.clear());

  // --- Text tool: a single floating input placed at the click point. ---
  const frame = document.querySelector('.stage__frame') as HTMLElement;
  let activeText: HTMLInputElement | null = null;

  const openTextInput = (e: PointerEvent): void => {
    // Only one input at a time — opening another commits the first (via its blur).
    if (activeText) activeText.blur();

    const anchor = toCanvasPoint(canvas, e);
    const frameRect = frame.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const displayRatio = canvasRect.width / canvas.width;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'text-input';
    input.setAttribute('aria-label', 'Annotation text');
    input.style.left = `${e.clientX - frameRect.left}px`;
    input.style.top = `${e.clientY - frameRect.top}px`;
    // Match the rendered label: fontSize = 8 + width*3 (canvas px), scaled to CSS px.
    input.style.fontSize = `${Math.max(11, (8 + editor.currentStrokeWidth * 3) * displayRatio)}px`;
    input.style.color = editor.currentColor;

    let settled = false;
    const commit = (): void => {
      if (settled) return;
      settled = true;
      const value = input.value;
      input.remove();
      if (activeText === input) activeText = null;
      editor.addText(anchor, value); // ignores empty/whitespace
    };
    const cancel = (): void => {
      if (settled) return;
      settled = true;
      input.remove();
      if (activeText === input) activeText = null;
    };

    input.addEventListener('keydown', (ke) => {
      if (ke.key === 'Enter') {
        ke.preventDefault();
        commit();
      } else if (ke.key === 'Escape') {
        ke.preventDefault();
        cancel();
      }
    });
    input.addEventListener('blur', commit);

    activeText = input;
    frame.appendChild(input);
    input.focus();
  };

  canvas.addEventListener('pointerdown', (e) => {
    if (editor.currentTool === 'text') {
      openTextInput(e);
      return;
    }
    editor.pointerDown(toCanvasPoint(canvas, e));
  });
  canvas.addEventListener('pointermove', (e) => editor.pointerMove(toCanvasPoint(canvas, e)));
  canvas.addEventListener('pointerup', () => editor.pointerUp());

  const store = new WebextStore(browser.storage.local);
  const select = document.getElementById('destination') as HTMLSelectElement;
  await populateDestinations(select, store);

  const shortnameInput = document.getElementById('shortname') as HTMLInputElement;
  const saveButton = document.getElementById('save') as HTMLButtonElement;
  const saveIcon = saveButton.querySelector('.save__icon') as HTMLElement | null;
  const saveLabel = document.getElementById('save-label');

  // Presentation-only: toggles the save button's in-flight look. The actual
  // double-submit guard is `saveButton.disabled`, set/cleared in the handler.
  const setSaving = (saving: boolean): void => {
    saveButton.classList.toggle('is-saving', saving);
    if (saveIcon) saveIcon.innerHTML = saving ? '<span class="spinner"></span>' : SEND_ICON;
    if (saveLabel) saveLabel.textContent = saving ? 'Saving…' : 'Save & copy';
  };

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
      showToast('No destination selected — add one in Options.', 'info');
      return;
    }

    // Prevent a double-click from uploading twice (which saves a -2 duplicate).
    saveButton.disabled = true;
    setSaving(true);
    try {
      const blob = await editor.toBlob();
      const transport = new HttpTransport();
      const result = await transport.upload(dest, blob, shortnameInput.value);
      await store.setLastUsedId(dest.id);
      // The upload succeeded — always report success. The clipboard copy is a
      // best-effort convenience; if it fails (e.g. the Save-click's user
      // activation expired during the round-trip) the file is still saved.
      showToast(`Saved: ${result.path}`, 'success');
      try {
        await navigator.clipboard.writeText(result.path);
        showToast(`Saved: ${result.path} (copied to clipboard)`, 'success');
      } catch (clipErr) {
        showToast(`Saved: ${result.path} (copy the path above manually)`, 'success');
        console.error('screenshot-drop: clipboard write failed', clipErr);
      }
    } catch (err) {
      if (err instanceof UploadError) {
        if (err.kind === 'auth') showToast('Auth failed — check the token in Options.', 'error');
        else if (err.kind === 'network') showToast('Could not reach the destination service.', 'error');
        else if (err.kind === 'server') showToast('Destination service returned an error.', 'error');
        else showToast('Destination service returned an unexpected response.', 'error');
      } else {
        showToast('Save failed — see console for details.', 'error');
      }
      console.error('screenshot-drop: save failed', err);
    } finally {
      saveButton.disabled = false;
      setSaving(false);
    }
  });
}

main().catch((err) => {
  console.error('screenshot-drop: annotate init failed', err);
});
