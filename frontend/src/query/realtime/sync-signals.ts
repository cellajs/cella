import type { ProductEntityType } from 'shared';
import type { AppStreamNotification } from '~/query/realtime/types';

/** A change the stream announced, in the fields of its envelope; no row data yet. */
export interface ChangeEventSignal {
  kind: AppStreamNotification['kind'];
  action: AppStreamNotification['action'];
  entityType: string | null;
  organizationId: string | null;
  channelId: string | null;
  subjectId: string | null;
}

/** Rows a sequence-range fetch just delivered. */
export interface SyncedRowsSignal {
  entityType: ProductEntityType;
  organizationId: string;
  rows: { id: string; [key: string]: unknown }[];
  /** A range the fetch could not deliver (overflow, unsupported, exhausted retries): `rows` is empty, and a subscriber that derives state from rows invalidates. */
  degraded: boolean;
}

type Handler<T> = (signal: T) => void;

/** One kind of in-process event: `publish` reaches every handler that `subscribe` registered, and `name` labels a failing handler's log line. */
export function createSignal<T>(name: string) {
  const handlers = new Set<Handler<T>>();

  /** A throwing handler is logged and skipped, so one bad subscriber cannot break the sync flow. */
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

/** Subscribe to announced changes to trigger work: every readable notification, before any tier decision, muted and archived channels included. */
export const onChangeEvent = changeEvent.subscribe;
export const publishChangeEvent = changeEvent.publish;

/** Subscribe to fetched rows to derive state from them: the fetch prioritizer publishes a range once it settles, a muted scope's notified ranges when it is opened. */
export const onSyncedRows = syncedRows.subscribe;
export const publishSyncedRows = syncedRows.publish;
