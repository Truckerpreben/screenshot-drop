import { describe, it, expect, beforeEach } from 'vitest';
import { WebextStore, type StorageArea } from '../src/platform/store-webext';
import type { Destination } from '../src/platform/transport';

function createStubStorage(): StorageArea {
  const data: Record<string, unknown> = {};
  return {
    async get(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys];
      const out: Record<string, unknown> = {};
      for (const k of list) out[k] = data[k];
      return out;
    },
    async set(items: Record<string, unknown>) {
      Object.assign(data, items);
    }
  };
}

const dest1: Destination = { id: 'd1', name: 'HCA-Worker-01', url: 'http://10.2.50.13:9922', token: 't1' };
const dest2: Destination = { id: 'd2', name: 'HCA-Worker-02', url: 'http://10.2.50.14:9922', token: 't2' };

describe('WebextStore', () => {
  let store: WebextStore;

  beforeEach(() => {
    store = new WebextStore(createStubStorage());
  });

  it('list returns an empty array when nothing is saved', async () => {
    expect(await store.list()).toEqual([]);
  });

  it('save adds a new destination', async () => {
    await store.save(dest1);
    expect(await store.list()).toEqual([dest1]);
  });

  it('save updates an existing destination with the same id', async () => {
    await store.save(dest1);
    const updated = { ...dest1, name: 'Renamed' };
    await store.save(updated);
    const list = await store.list();
    expect(list).toEqual([updated]);
  });

  it('remove deletes a destination by id', async () => {
    await store.save(dest1);
    await store.save(dest2);
    await store.remove(dest1.id);
    expect(await store.list()).toEqual([dest2]);
  });

  it('getLastUsedId returns null when never set', async () => {
    expect(await store.getLastUsedId()).toBeNull();
  });

  it('setLastUsedId then getLastUsedId round-trips', async () => {
    await store.setLastUsedId('d2');
    expect(await store.getLastUsedId()).toBe('d2');
  });
});
