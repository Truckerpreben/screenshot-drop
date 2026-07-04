import browser from './browser';
import { WebextStore } from '../platform/store-webext';
import { HttpTransport } from '../platform/transport-http';
import { UploadError } from '../platform/transport';
import type { Destination } from '../platform/transport';

const ICON_SERVER =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/></svg>';
const ICON_EDIT =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>';
const ICON_DELETE =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12"/></svg>';
const ICON_TEST =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12h4l2.5 7 5-14 2.5 7h4"/></svg>';
const ICON_OK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4 4 10-10"/></svg>';
const ICON_FAIL =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"/></svg>';
const ICON_SPINNER = '<span class="spinner"></span>';

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

/** Maps a ping failure to a user-facing, action-oriented message. */
function failureText(err: UploadError): string {
  switch (err.kind) {
    case 'auth':
      return 'Token rejected — check the token';
    case 'network':
      return 'Service unreachable — check the address';
    default:
      return 'Service error — is this a Screenshot Drop service?';
  }
}

type StatusVariant = 'pending' | 'success' | 'error';

const els = {
  list: () => document.getElementById('dest-list') as HTMLElement,
  empty: () => document.getElementById('dest-empty') as HTMLElement,
  count: () => document.getElementById('dest-count') as HTMLElement,
  form: () => document.getElementById('destination-form') as HTMLFormElement,
  error: () => document.getElementById('form-error') as HTMLElement,
  title: () => document.getElementById('form-title') as HTMLElement,
  cancel: () => document.getElementById('form-cancel') as HTMLButtonElement,
  submitLabel: () => document.getElementById('form-submit-label') as HTMLElement,
  test: () => document.getElementById('form-test') as HTMLButtonElement,
  testStatus: () => document.getElementById('form-test-status') as HTMLElement,
  id: () => document.getElementById('form-id') as HTMLInputElement,
  name: () => document.getElementById('form-name') as HTMLInputElement,
  url: () => document.getElementById('form-url') as HTMLInputElement,
  token: () => document.getElementById('form-token') as HTMLInputElement
};

function iconFor(variant: StatusVariant): string {
  if (variant === 'success') return ICON_OK;
  if (variant === 'error') return ICON_FAIL;
  return ICON_SPINNER;
}

/** Renders an inline status (icon + text) into a status element with a variant tone. */
function setStatus(el: HTMLElement, variant: StatusVariant, text: string): void {
  el.dataset.variant = variant;
  el.innerHTML = `<span class="status-ic" aria-hidden="true">${iconFor(variant)}</span><span class="status-tx"></span>`;
  const tx = el.querySelector('.status-tx') as HTMLElement | null;
  if (tx) tx.textContent = text;
  el.title = text;
  el.classList.add('is-shown');
}

function clearStatus(el: HTMLElement): void {
  el.innerHTML = '';
  el.classList.remove('is-shown');
  delete el.dataset.variant;
  el.removeAttribute('title');
}

/** Runs a ping against `dest`, driving a status element and disabling the button in flight. */
async function runTest(
  dest: Destination,
  button: HTMLButtonElement,
  iconSlot: HTMLElement,
  status: HTMLElement,
  onSettled?: () => void
): Promise<void> {
  const restoreIcon = iconSlot.innerHTML;
  button.disabled = true;
  iconSlot.innerHTML = ICON_SPINNER;
  setStatus(status, 'pending', 'Testing…');
  try {
    await new HttpTransport().ping(dest);
    setStatus(status, 'success', 'Connection OK');
  } catch (e) {
    if (e instanceof UploadError) setStatus(status, 'error', failureText(e));
    else setStatus(status, 'error', 'Test failed — see console for details.');
    console.error('screenshot-drop: ping failed', e);
  } finally {
    button.disabled = false;
    iconSlot.innerHTML = restoreIcon;
    onSettled?.();
  }
}

const rowResultTimers = new WeakMap<HTMLElement, ReturnType<typeof setTimeout>>();

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
  clearStatus(els.testStatus());
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

  // Transient inline test result for this row.
  const result = document.createElement('span');
  result.className = 'dest__result';
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');

  const actions = document.createElement('div');
  actions.className = 'dest__actions';

  const testButton = document.createElement('button');
  testButton.type = 'button';
  testButton.className = 'icon-btn dest__test';
  testButton.title = `Test connection to ${dest.name}`;
  testButton.setAttribute('aria-label', `Test connection to ${dest.name}`);
  testButton.innerHTML = ICON_TEST;
  testButton.addEventListener('click', () => {
    void runTest(dest, testButton, testButton, result, () => {
      const prev = rowResultTimers.get(result);
      if (prev) clearTimeout(prev);
      rowResultTimers.set(
        result,
        setTimeout(() => clearStatus(result), 5000)
      );
    });
  });

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

  actions.append(testButton, editButton, deleteButton);
  row.append(icon, info, result, actions);
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

  // Test the CURRENT form values so a destination can be verified before saving.
  els.test().addEventListener('click', () => {
    const name = els.name().value.trim();
    const url = els.url().value.trim();
    const token = els.token().value;

    const error = validate(name, url);
    if (error) {
      setStatus(els.testStatus(), 'error', error);
      return;
    }
    if (token === '') {
      setStatus(els.testStatus(), 'error', 'Token is required.');
      return;
    }

    const dest: Destination = { id: 'test', name, url, token };
    const iconSlot = els.test().querySelector('.form-test__icon') as HTMLElement;
    void runTest(dest, els.test(), iconSlot, els.testStatus());
  });

  // A stale connection result shouldn't linger after the inputs change.
  for (const field of [els.name(), els.url(), els.token()]) {
    field.addEventListener('input', () => clearStatus(els.testStatus()));
  }

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
