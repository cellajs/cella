/**
 * React Query IndexedDB Persister
 *
 * UNIVERSAL PATTERN - Part of the offline persistence layer.
 *
 * This persister stores React Query's cache in IndexedDB using Dexie,
 * enabling the cache to survive page refreshes and browser restarts.
 *
 * Works alongside:
 * - TanStack Offline Transactions (mutation outbox)
 * - Electric Sync (real-time data sync)
 * - Dexie attachment storage (file blobs, attachment-specific)
 */
import * as Sentry from '@sentry/react';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { appConfig } from 'config';
import { Dexie } from 'dexie';

interface PersistedRecord {
  key: string;
  timestamp: number;
  clientState: PersistedClient['clientState'];
  buster: string;
}

/**
 * Dexie database for React Query cache persistence.
 */
class QueryPersisterDB extends Dexie {
  persist!: Dexie.Table<PersistedRecord, string>;

  constructor() {
    super(`${appConfig.slug}-query-persister`);
    this.version(1).stores({ persist: 'key' });
  }
}

const queryDb = new QueryPersisterDB();

/**
 * Creates an IndexedDB persister for React Query using Dexie.
 * Persists the query cache to survive page refreshes and enable offline access.
 */
function createIDBPersister(idbValidKey: string = 'reactQuery') {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        await queryDb.persist.put(
          {
            key: idbValidKey,
            timestamp: client.timestamp,
            clientState: client.clientState,
            buster: client.buster,
          },
          idbValidKey,
        );
      } catch (error) {
        Sentry.captureException(error);
        console.error('[QueryPersister] Failed to persist client:', error);
      }
    },
    restoreClient: async () => {
      try {
        const persisted = await queryDb.persist.get(idbValidKey);
        if (persisted) {
          return {
            timestamp: persisted.timestamp,
            clientState: persisted.clientState,
            buster: persisted.buster,
          } as PersistedClient;
        }
        return undefined;
      } catch (error) {
        Sentry.captureException(error);
        console.error('[QueryPersister] Failed to restore client:', error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        await queryDb.persist.delete(idbValidKey);
      } catch (error) {
        Sentry.captureException(error);
        console.error('[QueryPersister] Failed to remove client:', error);
      }
    },
  } satisfies Persister;
}

export const persister = createIDBPersister();
