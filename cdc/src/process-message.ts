import type { Pgoutput } from 'pg-logical-replication';
import type { InsertActivityModel } from '#/db/schema/activities';
import { handleDelete, handleInsert, handleUpdate } from './handlers';
import type { TableRegistryEntry } from './types';
import { getTableEntry } from './utils';

/**
 * Result of processing a CDC message.
 * Includes the activity to insert, entity data for WebSocket delivery,
 * and the table entry for seq scope calculation.
 */
export interface ProcessMessageResult {
  activity: InsertActivityModel;
  entityData: Record<string, unknown>;
  entry: TableRegistryEntry;
}

/**
 * Process a pgoutput message and return activity + entity data if applicable.
 * Async to support enrichment queries for membership events.
 */
export async function processMessage(message: Pgoutput.Message): Promise<ProcessMessageResult | null> {
  // Only process insert, update, delete messages with a relation
  if (message.tag !== 'insert' && message.tag !== 'update' && message.tag !== 'delete') {
    return null;
  }

  // Single O(1) lookup - returns undefined if not tracked
  const entry = getTableEntry(message.relation.name);
  if (!entry) return null;

  switch (message.tag) {
    case 'insert':
      return await handleInsert(entry, message);
    case 'update':
      return await handleUpdate(entry, message);
    case 'delete':
      return await handleDelete(entry, message);
  }
}

