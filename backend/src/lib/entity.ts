import { eq, or } from 'drizzle-orm';
import { db } from '../db/db';
import { organizationsTable } from '../db/schema/organizations';
import { projectsTable } from '../db/schema/projects';
import { usersTable } from '../db/schema/users';
import { workspacesTable } from '../db/schema/workspaces';

// Create a map to store tables for different resource types
export const entityTables = new Map<string, typeof organizationsTable | typeof workspacesTable | typeof projectsTable | typeof usersTable>([
  ['ORGANIZATION', organizationsTable],
  ['WORKSPACE', workspacesTable],
  ['PROJECT', projectsTable],
  ['USER', usersTable],
]);

/**
 * Resolves entity based on ID or Slug and sets the context accordingly.
 * @param entityType - The type of the entity.
 * @param idOrSlug - The unique identifier (ID or Slug) of the entity.
 */
export const resolveEntity = async (entityType: string, idOrSlug: string) => {
  const table = entityTables.get(entityType.toUpperCase());

  // Return early if table is not available
  if (!table) throw new Error(`Invalid entity: ${entityType}`);

  const [resource] = await db
    .select()
    .from(table)
    .where(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)));

  return resource;
};
