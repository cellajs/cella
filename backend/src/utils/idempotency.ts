import { findActivityByMutationId, findActivityRefByMutationId } from '#/db/prepared';

/**
 * Check if a transaction has already been processed.
 * Idempotency check for replayed mutations.
 *
 * Uses a prepared statement since this runs on every create/update mutation.
 *
 * @param stxId - The client-generated mutation ID (nanoid)
 * @returns true if transaction exists in activities, false otherwise
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
  entityType: string;
  subjectId: string;
}

/**
 * Get the entity created/modified by a transaction.
 * Returns the existing entity for idempotent responses.
 *
 * Uses a prepared statement since this runs on every create/update mutation.
 *
 * @param stxId - The client-generated mutation ID (nanoid)
 * @returns Entity reference if found, null otherwise
 */
export async function getEntityByTransaction(stxId: string): Promise<EntityReference | null> {
  const [activity] = await findActivityRefByMutationId.execute({ mutationId: stxId });

  // entityType and subjectId are nullable in schema, narrow before returning
  if (!activity?.entityType || !activity?.subjectId) return null;
  return { entityType: activity.entityType, subjectId: activity.subjectId };
}
