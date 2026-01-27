/**
 * Session-scoped React Query persister.
 *
 * Uses sessionStorage which naturally has the lifecycle we want:
 * - Survives page refresh within the same tab
 * - Cleared when tab is closed
 * - Not shared across tabs
 *
 * This is used when offlineAccess is false - users get cache persistence
 * for the current session without full offline/cross-session capabilities.
 *
 * Note: sessionStorage has ~5MB limit. If this becomes an issue,
 * we can switch to session-scoped IndexedDB using a session ID.
 */
import * as Sentry from '@sentry/react';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';
import { appConfig } from 'config';

const STORAGE_KEY = `${appConfig.slug}-query-session-cache`;

/**
 * Creates a sessionStorage-based persister for React Query.
 * Data survives page refresh but is cleared when tab closes.
 */
export function createSessionPersister(): Persister {
  return {
    persistClient: async (client: PersistedClient) => {
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(client));
      } catch (error) {
        // QuotaExceededError - cache too large for sessionStorage
        // Silently fail - cache will just not persist
        if (error instanceof DOMException && error.name === 'QuotaExceededError') {
          console.debug('[SessionPersister] Cache too large, skipping persistence');
          return;
        }
        Sentry.captureException(error);
        console.error('[SessionPersister] Failed to persist:', error);
      }
    },
    restoreClient: async () => {
      try {
        const data = sessionStorage.getItem(STORAGE_KEY);
        return data ? (JSON.parse(data) as PersistedClient) : undefined;
      } catch (error) {
        Sentry.captureException(error);
        console.error('[SessionPersister] Failed to restore:', error);
        return undefined;
      }
    },
    removeClient: async () => {
      try {
        sessionStorage.removeItem(STORAGE_KEY);
      } catch (error) {
        Sentry.captureException(error);
        console.error('[SessionPersister] Failed to remove:', error);
      }
    },
  };
}

export const sessionPersister = createSessionPersister();
