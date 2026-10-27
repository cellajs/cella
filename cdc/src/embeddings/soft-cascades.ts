import { log } from '../lib/pino';
import type { PendingEvent } from '../types';
import { embeddedProductOf } from './reference-columns';

/** What an update lists beside the columns it is about: who wrote it and when. */
const bookkeepingFields = new Set(['updatedAt', 'updatedBy']);

/**
 * Whether an update of a host row did nothing but drop references to rows the transaction deletes: every column it
 * changed refers to a deleted type, bookkeeping aside. An update whose changed columns are unknown is no such update.
 */
function onlyPropagatesDeletes(hostProduct: string, changedFields: string[] | null | undefined, deleteTypes: Set<string>): boolean {
  if (!changedFields) return false;
  const written = changedFields.filter((field) => !bookkeepingFields.has(field));
  return (
    written.length > 0 &&
    written.every((field) => {
      const embedded = embeddedProductOf(hostProduct, field);
      return embedded !== undefined && deleteTypes.has(embedded);
    })
  );
}

/**
 * Suppresses the host updates of a transaction that only propagate its deletes of embedded rows; the client applies
 * those through propagateEmbeddings. It reads the changed columns: an update of a host row that changed anything
 * else, a rename or a soft delete, stays a change of its own.
 */
export function suppressSoftCascades(events: PendingEvent[]): PendingEvent[] {
  const deleteTypes = new Set<string>();
  for (const { result } of events) {
    if (result.activity.action === 'delete' && result.activity.entityType) deleteTypes.add(result.activity.entityType);
  }

  if (deleteTypes.size === 0) return events;

  const kept = events.filter(({ result: { activity } }) => {
    if (activity.action !== 'update' || !activity.entityType) return true;
    return !onlyPropagatesDeletes(activity.entityType, activity.changedFields, deleteTypes);
  });

  const softSuppressedCount = events.length - kept.length;
  if (softSuppressedCount > 0) {
    log.info('Suppressed soft cascade update events', { softSuppressedCount, deleteTypes: [...deleteTypes], survivingCount: kept.length });
  }

  return kept;
}
