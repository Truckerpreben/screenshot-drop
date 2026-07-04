import browser from './browser';
import { WebextStore } from '../platform/store-webext';
import type { Destination } from '../platform/transport';

const ICON_SERVER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>';
const ICON_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_DELETE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/></svg>';

/**
 * Validation is unchanged from the reviewed version: name must be non-empty
 * (trimmed by the caller), the address must start with http://, parse as a URL,
 * and include a host.
 */
function validate(name: string, url: string): string | null {
  if (name.trim() === '') return 'Name is required.';
  if (!url.startsWith('http://')) return 'Service address must start with http://';
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return 'Service address is not a valid URL.';
  }
  if (!parsed.host) return 'Service address must include a host (e.g. http://10.2.50.13:9922).';
  return null;
}

/** Masks a token to its last 4 characters — the token is never rendered in full. */
function maskToken(token: string): string {
  if (token.length <= 4) return '••••';
  return `${'•'.repeat(Math.min(token.length - 4, 8))}${token.slice(-4)}`;
}

const els = {
  list: () => document.getElementById('dest-list') as HTMLElement,
  empty: () => document.getElementById('dest-empty') as HTMLElement,
  count: () => document.getElementById('dest-count') as HTMLElement,
  form: () => document.getElementById('destination-form') as HTMLFormElement,
  error: () => document.getElementById('form-error') as HTMLElement,
  title: () => document.getElementById('form-title') as HTMLElement,
  cancel: () => document.getElementById('form-cancel') as HTMLButtonElement,
  submitLabel: () => document.getElementById('form-submit-label') as HTMLElement,
  id: () => document.getElementById('form-id') as HTMLInputElement,
  name: () => document.getElementById('form-name') as HTMLInputElement,
  url: () => document.getElementById('form-url') as HTMLInputElement,
  token: () => document.getElementById('form-token') as HTMLInputElement
};

function fillForm(dest: Destination): void {
  els.id().value = dest.id;
  els.name().value = dest.name;
  els.url().value = dest.url;
  els.token().value = dest.token;
}

function clearForm(): void {
  els.id().value = '';
  els.name().value = '';
  els.url().value = '';
  els.token().value = '';
  els.error().textContent = '';
}

/** Presentational: flips the form header/actions between add and edit modes. */
function setEditMode(editing: boolean): void {
  els.title().textContent = editing ? 'Edit destination' : 'Add a destination';
  els.submitLabel().textContent = editing ? 'Update destination' : 'Save destination';
  els.cancel().hidden = !editing;
}

function buildRow(dest: Destination, store: WebextStore): HTMLElement {
  const row = document.createElement('div');
  row.className = 'dest';
  row.setAttribute('role', 'listitem');

  const icon = document.createElement('div');
  icon.className = 'dest__icon';
  icon.innerHTML = ICON_SERVER;

  const info = document.createElement('div');
  info.className = 'dest__info';

  const name = document.createElement('div');
  name.className = 'dest__name';
  name.textContent = dest.name;

  const meta = document.createElement('div');
  meta.className = 'dest__meta';
  const url = document.createElement('span');
  url.className = 'dest__url mono';
  url.textContent = dest.url;
  const token = document.createElement('span');
  token.className = 'dest__token mono';
  token.textContent = maskToken(dest.token);
  token.title = 'Token (masked)';
  meta.append(url, token);

  info.append(name, meta);

  const actions = document.createElement('div');
  actions.className = 'dest__actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'icon-btn';
  editButton.title = `Edit ${dest.name}`;
  editButton.setAttribute('aria-label', `Edit ${dest.name}`);
  editButton.innerHTML = ICON_EDIT;
  editButton.addEventListener('click', () => {
    fillForm(dest);
    setEditMode(true);
    els.name().focus();
    els.title().scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'icon-btn dest__del';
  deleteButton.title = `Delete ${dest.name}`;
  deleteButton.setAttribute('aria-label', `Delete ${dest.name}`);
  deleteButton.innerHTML = ICON_DELETE;
  deleteButton.addEventListener('click', async () => {
    await store.remove(dest.id);
    await render(store);
  });

  actions.append(editButton, deleteButton);
  row.append(icon, info, actions);
  return row;
}

async function render(store: WebextStore): Promise<void> {
  const destinations = await store.list();
  const list = els.list();
  list.innerHTML = '';

  els.count().textContent = String(destinations.length);
  els.empty().hidden = destinations.length > 0;

  for (const dest of destinations) {
    list.appendChild(buildRow(dest, store));
  }
}

async function main(): Promise<void> {
  const store = new WebextStore(browser.storage.local);
  await render(store);
  setEditMode(false);

  els.cancel().addEventListener('click', () => {
    clearForm();
    setEditMode(false);
  });

  els.form().addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = els.id().value;
    const name = els.name().value.trim();
    const url = els.url().value.trim();
    const token = els.token().value;

    const error = validate(name, url);
    if (error) {
      els.error().textContent = error;
      return;
    }
    els.error().textContent = '';

    const dest: Destination = { id: id || crypto.randomUUID(), name, url, token };
    await store.save(dest);
    clearForm();
    setEditMode(false);
    await render(store);
  });
}

main().catch((err) => {
  console.error('screenshot-drop: options init failed', err);
});
