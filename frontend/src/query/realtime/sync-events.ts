import type { ProductEntityType } from 'shared';
import type { AppStreamChange } from '~/query/realtime/types';

/** A change the stream announced, in the fields of its envelope; no row data yet. */
export interface AnnouncedChange {
  action: AppStreamChange['action'];
  entityType: ProductEntityType;
  organizationId: string;
  channelId: string | null;
  subjectId: string;
}

/** Rows a sequence-range fetch just delivered. */
export interface SyncedRows {
  entityType: ProductEntityType;
  organizationId: string;
  rows: { id: string; [key: string]: unknown }[];
  /** A range the fetch could not deliver (overflow, unsupported, exhausted retries): `rows` is empty, and a subscriber that derives state from rows invalidates. */
  degraded: boolean;
}

type Handler<T> = (event: T) => void;

/** One kind of in-process event: `publish` reaches every handler that `subscribe` registered, and `name` labels a failing handler's log line. */
export function createEmitter<T>(name: string) {
  const handlers = new Set<Handler<T>>();

  /** A throwing handler is logged and skipped, so one bad subscriber cannot break the sync flow. */
  const publish = (event: T): void => {
    for (const handler of handlers) {
      try {
        handler(event);
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

const changeEvent = createEmitter<AnnouncedChange>('AnnouncedChange');
const syncedRows = createEmitter<SyncedRows>('SyncedRows');

/** Subscribe to announced changes to trigger work: every readable change, before any tier decision, muted and archived channels included. */
export const onChangeEvent = changeEvent.subscribe;
export const publishChangeEvent = changeEvent.publish;

/** Subscribe to fetched rows to derive state from them: the fetch prioritizer publishes a range once it settles, a muted scope's announced ranges when it is opened. */
export const onSyncedRows = syncedRows.subscribe;
export const publishSyncedRows = syncedRows.publish;
