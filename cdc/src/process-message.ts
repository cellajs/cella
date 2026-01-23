import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { handleDelete, handleInsert, handleUpdate } from './handlers';
import { getTableEntry } from './utils';

/**
 * Result of processing a CDC message.
 * Includes both the activity to insert and the entity data for WebSocket delivery.
 */
export interface ProcessMessageResult {
  activity: InsertActivityModel;
  entityData: Record<string, unknown>;
}

/**
 * Process a pgoutput message and return activity + entity data if applicable.
 */
export function processMessage(message: Pgoutput.Message): ProcessMessageResult | null {
  // Only process insert, update, delete messages with a relation
  if (message.tag !== 'insert' && message.tag !== 'update' && message.tag !== 'delete') {
    return null;
  }

  // Single O(1) lookup - returns undefined if not tracked
  const entry = getTableEntry(message.relation.name);
  if (!entry) return null;

  switch (message.tag) {
    case 'insert':
      return handleInsert(entry, message);
    case 'update':
      return handleUpdate(entry, message);
    case 'delete':
      return handleDelete(entry, message);
  }
}

