import { findActivityByMutationId } from '#/db/prepared';

/** Replay check on the client-generated mutation id. Prepared, since it runs on every mutation. */
export async function isTransactionProcessed(stxId: string): Promise<boolean> {
  const existing = await findActivityByMutationId.execute({ mutationId: stxId });
  return existing.length > 0;
}

/**
 * The hydrated entities when the transaction was already processed, null when it is new.
 * @param stxId - The client-generated mutation id.
 * @param findExisting - Reads the caller's own rows under `stxId` (filter on `createdBy`): mutation ids travel in sync
 * payloads, so a replay by another actor must find nothing and create its own rows.
 */
export async function checkIdempotency<T>(stxId: string, findExisting: () => Promise<T[]>): Promise<T[] | null> {
  if (!(await isTransactionProcessed(stxId))) return null;
  const batch = await findExisting();
  return batch.length > 0 ? batch : null;
}
