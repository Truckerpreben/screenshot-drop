import type { Destination } from './transport';
import type { DestinationStore } from './store';

const DESTINATIONS_KEY = 'destinations';
const LAST_USED_KEY = 'lastUsedDestinationId';

export interface StorageArea {
  get(keys: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

/** DestinationStore backed by browser.storage.local (or an injected stub for tests). */
export class WebextStore implements DestinationStore {
  constructor(private storage: StorageArea) {}

  async list(): Promise<Destination[]> {
    const result = await this.storage.get(DESTINATIONS_KEY);
    return (result[DESTINATIONS_KEY] as Destination[] | undefined) ?? [];
  }

  async save(d: Destination): Promise<void> {
    const existing = await this.list();
    const idx = existing.findIndex((x) => x.id === d.id);
    if (idx === -1) {
      existing.push(d);
    } else {
      existing[idx] = d;
    }
    await this.storage.set({ [DESTINATIONS_KEY]: existing });
  }

  async remove(id: string): Promise<void> {
    const existing = await this.list();
    const filtered = existing.filter((x) => x.id !== id);
    await this.storage.set({ [DESTINATIONS_KEY]: filtered });
  }

  async getLastUsedId(): Promise<string | null> {
    const result = await this.storage.get(LAST_USED_KEY);
    return (result[LAST_USED_KEY] as string | undefined) ?? null;
  }

  async setLastUsedId(id: string): Promise<void> {
    await this.storage.set({ [LAST_USED_KEY]: id });
  }
}
