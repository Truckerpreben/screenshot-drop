import browser from './browser';
import { AnnotationEditor } from '../core/editor';
import { TOOLS, toolForKey, nextColor } from '../core/tools';
import { captureStorageKey } from './messaging';
import { HttpTransport } from '../platform/transport-http';
import { UploadError } from '../platform/transport';
import { WebextStore } from '../platform/store-webext';
import type { Destination } from '../platform/transport';

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
  const id = getCaptureId();
  const dataUrl = await loadCapture(id);
  const image = await loadImage(dataUrl);

  const canvas = document.getElementById('canvas') as HTMLCanvasElement;
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;

  const editor = new AnnotationEditor({ canvas, image });

  const toolbar = document.getElementById('toolbar') as HTMLElement;
  for (const tool of TOOLS) {
    const button = document.createElement('button');
    button.textContent = `${tool.label} (${tool.key})`;
    button.addEventListener('click', () => editor.setTool(tool.id));
    toolbar.appendChild(button);
  }

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
    // Ctrl+Z / Cmd+Z undoes an annotation, but not while the shortname field
    // has focus — there we let the browser's own text-field undo run.
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
      if (document.activeElement === shortnameInput) return;
      e.preventDefault();
      undo();
      return;
    }
    const tool = toolForKey(e.key);
    if (tool) editor.setTool(tool);
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

    try {
      const blob = await editor.toBlob();
      const transport = new HttpTransport();
      const result = await transport.upload(dest, blob, shortnameInput.value);
      await store.setLastUsedId(dest.id);
      await navigator.clipboard.writeText(result.path);
      showToast(`Saved: ${result.path} (copied to clipboard)`);
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
    }
  });
}

main().catch((err) => {
  console.error('screenshot-drop: annotate init failed', err);
});
