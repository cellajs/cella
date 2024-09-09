import { eq, inArray, or } from 'drizzle-orm';
import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

// TODO:generics issue: Create a map to store tables for different resource types
export const entityTables = new Map<string, typeof usersTable | typeof organizationsTable>([
  ['user', usersTable],
  ['organization', organizationsTable],
]);

/**
 * Resolves entity based on ID or Slug and sets the context accordingly.
 * @param entityType - The type of the entity.
 * @param idOrSlug - The unique identifier (ID or Slug) of the entity.
 */
export const resolveEntity = async (entityType: string, idOrSlug: string) => {
  const table = entityTables.get(entityType);

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entity: ${entityType}`);

  const [entity] = await db
    .select()
    .from(table)
    .where(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)));

  return entity;
};

/**
 * Resolves entities based on their IDs and sets the context accordingly.
 * @param entityType - The type of the entity.
 * @param ids - An array of unique identifiers (IDs) of the entities.
 */
export const resolveEntities = async (entityType: string, ids: Array<string>) => {
  // Get the corresponding table for the entity type
  const table = entityTables.get(entityType);

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entity: ${entityType}`);

  // Validate presence of IDs
  if (!Array.isArray(ids) || !ids.length) throw new Error(`Missing or invalid query identifiers for entity: ${entityType}`);

  // Query for multiple entities by IDs
  const entities = await db.select().from(table).where(inArray(table.id, ids));

  return entities;
};
