import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { Dexie } from 'dexie';

// Create a simple Dexie instance for react-query persistence
class QueryPersisterDB extends Dexie {
  persist!: Dexie.Table<any, string>;

  constructor() {
    super('CellaQueryPersister');
    this.version(1).stores({
      persist: 'key',
    });
  }
}

const queryDb = new QueryPersisterDB();

/**
 * Create an IndexedDB persister for react-query using Dexie
 */
function createIDBPersister(idbValidKey: string = 'reactQuery') {
  return {
    persistClient: async (client: PersistedClient) => {
      await queryDb.persist.put({ key: idbValidKey, ...client }, idbValidKey);
    },
    restoreClient: async () => {
      const persisted = await queryDb.persist.get(idbValidKey);
      if (persisted) {
        const { key, ...client } = persisted;
        return client as PersistedClient;
      }
      return undefined;
    },
    removeClient: async () => {
      await queryDb.persist.delete(idbValidKey);
    },
  } as Persister;
}

export const persister = createIDBPersister();
