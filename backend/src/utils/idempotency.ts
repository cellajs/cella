import type { EntityType } from 'shared';
import { findActivityByMutationId, findActivityRefByMutationId } from '#/db/prepared';

/**
 * Idempotency check for replayed mutations: has this transaction already been processed?
 * Prepared statement, since it runs on every create/update mutation.
 *
 * @param stxId - The client-generated mutation ID (nanoid)
 */
export async function isTransactionProcessed(stxId: string): Promise<boolean> {
  const existing = await findActivityByMutationId.execute({ mutationId: stxId });
  return existing.length > 0;
}

/**
 * Check idempotency and return existing entities if the transaction was already processed.
 * Returns the hydrated entities if found, or null if this is a new transaction.
 */
export async function checkIdempotency<T>(stxId: string, findExisting: () => Promise<T[]>): Promise<T[] | null> {
  if (!(await isTransactionProcessed(stxId))) return null;
  const batch = await findExisting();
  return batch.length > 0 ? batch : null;
}

interface EntityReference {
  entityType: EntityType;
  subjectId: string;
}

/**
 * Get the entity created/modified by a transaction (the existing entity, for idempotent responses).
 * Prepared statement, since it runs on every create/update mutation.
 *
 * @param stxId - The client-generated mutation ID (nanoid)
 */
export async function getEntityByTransaction(stxId: string): Promise<EntityReference | null> {
  const [activity] = await findActivityRefByMutationId.execute({ mutationId: stxId });

  // entityType and subjectId are nullable in schema, narrow before returning
  if (!activity?.entityType || !activity?.subjectId) return null;
  return { entityType: activity.entityType, subjectId: activity.subjectId };
}
