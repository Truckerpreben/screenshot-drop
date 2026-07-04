import type { Destination } from './transport';

export interface DestinationStore {
  list(): Promise<Destination[]>;
  save(d: Destination): Promise<void>;
  remove(id: string): Promise<void>;
  getLastUsedId(): Promise<string | null>;
  setLastUsedId(id: string): Promise<void>;
}
