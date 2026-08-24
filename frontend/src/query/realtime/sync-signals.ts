import type { ProductEntityType } from 'shared';
import type { AppStreamNotification } from './types';

/**
 * A change the stream announced. Mirrors the stream envelope; no row data is available yet.
 *
 * Dispatch is permission-filtered but not tier-filtered, so this covers every readable change
 * including muted and archived channels, whose rows are only fetched when opened.
 */
export interface ChangeEventSignal {
  kind: AppStreamNotification['kind'];
  action: AppStreamNotification['action'];
  entityType: string | null;
  organizationId: string | null;
  channelId: string | null;
  subjectId: string | null;
}

/**
 * Rows that just landed from a sequence-range sync.
 *
 * `degraded` marks a range the fetch could not deliver (overflow, unsupported, exhausted retries):
 * activity did occur, but `rows` is empty, so subscribers that derive state from row contents must
 * fall back to invalidation.
 */
export interface SyncedRowsSignal {
  entityType: ProductEntityType;
  organizationId: string;
  rows: { id: string; [key: string]: unknown }[];
  degraded: boolean;
}

type Handler<T> = (signal: T) => void;

function createSignal<T>(name: string) {
  const handlers = new Set<Handler<T>>();

  /** Handlers must not throw; one bad subscriber may not break the sync flow. */
  const publish = (signal: T): void => {
    for (const handler of handlers) {
      try {
        handler(signal);
      } catch (error) {
        console.error(`[${name}] subscriber failed:`, error);
      }
    }
  };

  const subscribe = (handler: Handler<T>): (() => void) => {
    handlers.add(handler);
    return () => {
      handlers.delete(handler);
    };
  };

  return { publish, subscribe };
}

const changeEvent = createSignal<ChangeEventSignal>('ChangeEventSignal');
const syncedRows = createSignal<SyncedRowsSignal>('SyncedRowsSignal');

/**
 * Subscribe to announced changes; use it to trigger work. Published by the app stream handler for
 * every notification, before any tier decision, carrying ids only.
 */
export const onChangeEvent = changeEvent.subscribe;
export const publishChangeEvent = changeEvent.publish;

/**
 * Subscribe to fetched rows; use it to derive state from row contents. Published by the fetch
 * prioritizer once a range settles, never for scopes it defers to open-time.
 */
export const onSyncedRows = syncedRows.subscribe;
export const publishSyncedRows = syncedRows.publish;
