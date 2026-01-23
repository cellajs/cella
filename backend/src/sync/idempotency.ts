import { sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';

/**
 * Check if a transaction has already been processed.
 * Used for idempotency - ensures replayed mutations don't create duplicates.
 *
 * @param transactionId - The client-generated transaction ID
 * @returns true if transaction exists in activities, false otherwise
 */
export async function isTransactionProcessed(transactionId: string): Promise<boolean> {
  const existing = await db
    .select({ id: activitiesTable.id })
    .from(activitiesTable)
    .where(sql`${activitiesTable.tx}->>'transactionId' = ${transactionId}`)
    .limit(1);

  return existing.length > 0;
}

interface EntityReference {
  entityType: string;
  entityId: string;
}

/**
 * Get the entity created/modified by a transaction.
 * Used to return existing entity for idempotent responses.
 *
 * @param transactionId - The client-generated transaction ID
 * @returns Entity reference if found, null otherwise
 */
export async function getEntityByTransaction(transactionId: string): Promise<EntityReference | null> {
  const [activity] = await db
    .select({
      entityType: activitiesTable.entityType,
      entityId: activitiesTable.entityId,
    })
    .from(activitiesTable)
    .where(sql`${activitiesTable.tx}->>'transactionId' = ${transactionId}`)
    .limit(1);

  // entityType and entityId are nullable in schema, narrow before returning
  if (!activity?.entityType || !activity?.entityId) return null;
  return { entityType: activity.entityType, entityId: activity.entityId };
}
