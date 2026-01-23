import type { EntityType } from 'config';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';

interface ConflictCheckParams {
  entityType: EntityType;
  entityId: string;
  changedField: string;
  expectedTransactionId: string | null;
}

interface ConflictCheckResult {
  hasConflict: boolean;
  serverTransactionId: string | null;
}

/**
 * Check if a field has been modified since the client last saw it.
 * Queries activitiesTable for the latest transaction that modified this field.
 *
 * @returns hasConflict=true if serverTransactionId differs from expectedTransactionId
 */
export async function checkFieldConflict({
  entityType,
  entityId,
  changedField,
  expectedTransactionId,
}: ConflictCheckParams): Promise<ConflictCheckResult> {
  const [latest] = await db
    .select({ tx: activitiesTable.tx })
    .from(activitiesTable)
    .where(
      and(
        eq(activitiesTable.entityType, entityType),
        eq(activitiesTable.entityId, entityId),
        sql`${activitiesTable.tx}->>'changedField' = ${changedField}`,
        sql`${activitiesTable.tx}->>'transactionId' IS NOT NULL`,
      ),
    )
    .orderBy(desc(activitiesTable.createdAt))
    .limit(1);

  const serverTransactionId = latest?.tx?.transactionId ?? null;

  // Conflict if server has a transaction and it differs from expected
  const hasConflict = serverTransactionId !== null && serverTransactionId !== expectedTransactionId;

  return { hasConflict, serverTransactionId };
}

/**
 * Conflict error metadata for API responses.
 */
export interface FieldConflictMeta {
  field: string;
  expectedTransactionId: string | null;
  serverTransactionId: string | null;
}
