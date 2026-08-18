import type { EntityType } from 'shared';
import { findActivityByMutationId, findActivityRefByMutationId } from '#/db/prepared';

/** Replay check on the client-generated mutation id. Prepared, since it runs on every mutation. */
export async function isTransactionProcessed(stxId: string): Promise<boolean> {
  const existing = await findActivityByMutationId.execute({ mutationId: stxId });
  return existing.length > 0;
}

/** The hydrated entities when the transaction was already processed, null when it is new. */
export async function checkIdempotency<T>(stxId: string, findExisting: () => Promise<T[]>): Promise<T[] | null> {
  if (!(await isTransactionProcessed(stxId))) return null;
  const batch = await findExisting();
  return batch.length > 0 ? batch : null;
}

interface EntityReference {
  entityType: EntityType;
  subjectId: string;
}

/** The entity a transaction created or modified, for idempotent responses. */
export async function getEntityByTransaction(stxId: string): Promise<EntityReference | null> {
  const [activity] = await findActivityRefByMutationId.execute({ mutationId: stxId });

  // entityType and subjectId are nullable in the schema; narrow before returning.
  if (!activity?.entityType || !activity?.subjectId) return null;
  return { entityType: activity.entityType, subjectId: activity.subjectId };
}
