import { type ActivityAction, appConfig, type ProductEntityType } from 'shared';
import type { PendingEvent } from '../types';
import { cleanupEmbeddingReferences, isReferenceCleanupWrite } from './embedding-cleanup';
import { gcOwnedEmbeddedRows } from './owned-embedding-gc';
import { suppressSoftCascades } from './soft-cascades';

/** Whether the app declares an embedding in `appConfig.productEmbeddings`. The template declares none: every hook returns at once. */
const hasEmbeddings = appConfig.productEmbeddings.length > 0;

/**
 * Hook of a flush, after a group of product changes of one type and action was handed to the API. Both steps write
 * outside the flush's transaction, and a statement that fails rejects the flush.
 */
export async function embeddingsAfterDispatch(productType: ProductEntityType, action: ActivityAction, events: PendingEvent[]): Promise<void> {
  if (!hasEmbeddings) return;

  // Strip deleted embedded-entity ids from host-entity arrays.
  if (action === 'update' || action === 'delete') await cleanupEmbeddingReferences(productType, action, events);

  // Soft-delete embedded rows their host arrays stopped referencing; hard deletes ride FK cascades.
  if (action === 'update') await gcOwnedEmbeddedRows(productType, events);
}

/**
 * Hook of the transaction buffer, at the commit of a source transaction.
 * @returns The changes without the host updates that propagate an embedded delete of the same transaction.
 */
export function suppressEmbeddingPropagation(events: PendingEvent[]): PendingEvent[] {
  return hasEmbeddings ? suppressSoftCascades(events) : events;
}

/**
 * Hook of the update handler.
 * @param hostType - The type of the updated row.
 * @returns Whether the update is the worker's own cleanup of an embedding column, which is no activity.
 */
export function isEmbeddingCleanupWrite(hostType: string, changedFields: string[] | null): boolean {
  return hasEmbeddings && isReferenceCleanupWrite(hostType, changedFields);
}
