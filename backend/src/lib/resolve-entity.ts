import { eq, inArray, or } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { EntityType } from 'shared';
import { db } from '#/db/db';
import { entityTables } from '#/table-config';

export type EntityModel<T extends EntityType> = (typeof entityTables)[T]['$inferSelect'];

// Helper type for entity tables with common columns
type EntityTable = PgTable & { id: unknown; slug?: unknown };

/** Database or transaction type for optional db parameter */
type DbOrTx = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Resolves entity based on `id` or `slug`.
 *
 * @param entityType - The type of entity.
 * @param idOrSlug - The unique identifier or slug of entity.
 * @param dbOrTx - Optional database or transaction to use (defaults to global db).
 */
export async function resolveEntity<T extends EntityType>(
  entityType: T,
  idOrSlug: string,
  dbOrTx?: DbOrTx,
): Promise<EntityModel<T> | undefined>;
export async function resolveEntity<T extends EntityType>(entityType: T, idOrSlug: string, dbOrTx: DbOrTx = db) {
  const table = entityTables[entityType] as EntityTable;

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  // Build where condition: always match by id, optionally by slug if column exists
  // TODO review resolveEntity and resolveEntities. perahps
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic table access requires type assertion
  const idCondition = eq((table as any).id, idOrSlug);
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic table access requires type assertion
  const slugColumn = (table as any).slug;
  const whereCondition = slugColumn ? or(idCondition, eq(slugColumn, idOrSlug)) : idCondition;

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic table access requires type assertion
  const [entity] = await dbOrTx
    .select()
    .from(table as any)
    .where(whereCondition);

  return entity;
}

/**
 * Resolves entities based on array of `id`.
 *
 * @param entityType - The type of the entity.
 * @param ids - An array of unique identifiers (IDs) of entities to resolve.
 */
export async function resolveEntities<T extends EntityType>(
  entityType: T,
  ids: Array<string>,
): Promise<Array<EntityModel<T>>> {
  // Get the corresponding table for the entity type
  const table = entityTables[entityType] as EntityTable;

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  // Validate presence of IDs
  if (!Array.isArray(ids) || !ids.length)
    throw new Error(`Missing or invalid query identifiers for entityType: ${entityType}`);

  // Query for multiple entities by IDs
  // biome-ignore lint/suspicious/noExplicitAny: Dynamic table access requires type assertion
  const entities = await db
    .select()
    .from(table as any)
    .where(inArray((table as any).id, ids));

  return entities as Array<EntityModel<T>>;
}
