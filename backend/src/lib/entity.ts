import type { EntityType } from 'config';
import { eq, inArray, or, type TableConfig } from 'drizzle-orm';
import type { PgTableWithColumns } from 'drizzle-orm/pg-core';
import { db } from '#/db/db';
import { entityTables } from '#/table-config';

export type EntityModel<T extends EntityType> = (typeof entityTables)[T]['$inferSelect'];

/**
 * Resolves entity based on `id`.
 *
 * @param entityType - The type of entity.
 * @param id - The unique identifier of entity.
 */
export async function resolveEntity<T extends EntityType>(
  entityType: T,
  idOrSlug: string,
): Promise<EntityModel<T> | undefined>;
export async function resolveEntity<T extends EntityType>(entityType: T, idOrSlug: string) {
  const table = entityTables[entityType] as unknown as PgTableWithColumns<TableConfig>;

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  const [entity] = await db
    .select()
    .from(table)
    .where(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)));

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
  const table = entityTables[entityType] as unknown as PgTableWithColumns<TableConfig>;

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  // Validate presence of IDs
  if (!Array.isArray(ids) || !ids.length)
    throw new Error(`Missing or invalid query identifiers for entityType: ${entityType}`);

  // Query for multiple entities by IDs
  const entities = await db.select().from(table).where(inArray(table.id, ids));

  return entities as Array<EntityModel<T>>;
}
