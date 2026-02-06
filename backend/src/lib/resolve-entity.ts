import { eq, inArray, or } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { EntityType } from 'shared';
import { db } from '#/db/db';
import { entityTables } from '#/table-config';

export type EntityModel<T extends EntityType> = (typeof entityTables)[T]['$inferSelect'];

// Helper type for entity tables with common columns
type EntityTable = PgTable & { id: unknown; slug?: unknown };

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
  const table = entityTables[entityType] as EntityTable;

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entityType: ${entityType}`);

  // biome-ignore lint/suspicious/noExplicitAny: Dynamic table access requires type assertion
  const [entity] = await db
    .select()
    .from(table as any)
    .where(or(eq((table as any).id, idOrSlug), eq((table as any).slug, idOrSlug)));

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
