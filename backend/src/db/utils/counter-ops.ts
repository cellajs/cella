import { and, eq, sql } from 'drizzle-orm';
import { unsafeInternalDb as db } from '#/db/db';
import { countersTable } from '#/db/schema/counters';

/**
 * Atomically increment a counter and return the new value.
 * Creates the counter if it doesn't exist (upsert).
 *
 * Uses GREATEST(0, value + delta) to prevent negative values on decrements.
 *
 * @param namespace - Counter category: 'seq', 'count', 'usage', etc.
 * @param scope - Scope identifier: orgId, userId, projectId, etc.
 * @param key - Optional sub-key for granularity (default: '')
 * @param delta - Amount to increment (default: 1, use negative to decrement)
 * @returns The new counter value after increment
 */
export async function incrementCounter(namespace: string, scope: string, key = '', delta = 1): Promise<number> {
  const result = await db
    .insert(countersTable)
    .values({
      namespace,
      scope,
      key,
      value: Math.max(0, delta),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [countersTable.namespace, countersTable.scope, countersTable.key],
      set: {
        // GREATEST prevents negative values on decrement
        value: sql`GREATEST(0, ${countersTable.value} + ${delta})`,
        updatedAt: new Date(),
      },
    })
    .returning({ value: countersTable.value });

  return result[0].value;
}

/**
 * Get the current value of a counter.
 *
 * @param namespace - Counter category
 * @param scope - Scope identifier
 * @param key - Optional sub-key (default: '')
 * @returns Current counter value, or 0 if not found
 */
export async function getCounter(namespace: string, scope: string, key = ''): Promise<number> {
  const result = await db
    .select({ value: countersTable.value })
    .from(countersTable)
    .where(and(eq(countersTable.namespace, namespace), eq(countersTable.scope, scope), eq(countersTable.key, key)))
    .limit(1);

  return result[0]?.value ?? 0;
}

/**
 * Delete all counters for a given scope.
 * Use when an org/project is deleted to clean up orphaned counters.
 *
 * @param scope - Scope identifier to delete
 * @returns Number of counters deleted
 */
export async function deleteCountersByScope(scope: string): Promise<number> {
  const result = await db
    .delete(countersTable)
    .where(eq(countersTable.scope, scope))
    .returning({ namespace: countersTable.namespace });

  return result.length;
}

/**
 * Get all counters for a given scope.
 * Useful for dashboards or debugging.
 *
 * @param scope - Scope identifier
 * @returns Map of "namespace:key" → value
 */
export async function getCountersByScope(scope: string): Promise<Record<string, number>> {
  const results = await db
    .select({
      namespace: countersTable.namespace,
      key: countersTable.key,
      value: countersTable.value,
    })
    .from(countersTable)
    .where(eq(countersTable.scope, scope));

  return Object.fromEntries(results.map((r) => [`${r.namespace}${r.key ? `:${r.key}` : ''}`, r.value]));
}
