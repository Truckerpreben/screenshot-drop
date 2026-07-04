import browser from './browser';
import { WebextStore } from '../platform/store-webext';
import type { Destination } from '../platform/transport';

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

function maskToken(token: string): string {
  if (token.length <= 4) return '****';
  return `${'*'.repeat(token.length - 4)}${token.slice(-4)}`;
}

function fillForm(dest: Destination): void {
  (document.getElementById('form-id') as HTMLInputElement).value = dest.id;
  (document.getElementById('form-name') as HTMLInputElement).value = dest.name;
  (document.getElementById('form-url') as HTMLInputElement).value = dest.url;
  (document.getElementById('form-token') as HTMLInputElement).value = dest.token;
}

function clearForm(): void {
  (document.getElementById('form-id') as HTMLInputElement).value = '';
  (document.getElementById('form-name') as HTMLInputElement).value = '';
  (document.getElementById('form-url') as HTMLInputElement).value = '';
  (document.getElementById('form-token') as HTMLInputElement).value = '';
}

async function render(store: WebextStore): Promise<void> {
  const tbody = document.getElementById('destinations-body') as HTMLTableSectionElement;
  tbody.innerHTML = '';
  const destinations = await store.list();

  for (const dest of destinations) {
    const row = document.createElement('tr');

    const nameCell = document.createElement('td');
    nameCell.textContent = dest.name;
    row.appendChild(nameCell);

    const urlCell = document.createElement('td');
    urlCell.textContent = dest.url;
    row.appendChild(urlCell);

    const tokenCell = document.createElement('td');
    tokenCell.textContent = maskToken(dest.token);
    row.appendChild(tokenCell);

    const actionsCell = document.createElement('td');
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => fillForm(dest));
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.addEventListener('click', async () => {
      await store.remove(dest.id);
      await render(store);
    });
    actionsCell.append(editButton, deleteButton);
    row.appendChild(actionsCell);

    tbody.appendChild(row);
  }
}

async function main(): Promise<void> {
  const store = new WebextStore(browser.storage.local);
  await render(store);

  const form = document.getElementById('destination-form') as HTMLFormElement;
  const errorEl = document.getElementById('form-error') as HTMLElement;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = (document.getElementById('form-id') as HTMLInputElement).value;
    const name = (document.getElementById('form-name') as HTMLInputElement).value.trim();
    const url = (document.getElementById('form-url') as HTMLInputElement).value.trim();
    const token = (document.getElementById('form-token') as HTMLInputElement).value;

    const error = validate(name, url);
    if (error) {
      errorEl.textContent = error;
      return;
    }
    errorEl.textContent = '';

    const dest: Destination = { id: id || crypto.randomUUID(), name, url, token };
    await store.save(dest);
    clearForm();
    await render(store);
  });
}

main().catch((err) => {
  console.error('screenshot-drop: options init failed', err);
});
