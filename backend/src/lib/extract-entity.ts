import { eq, or } from "drizzle-orm";
import { organizationsTable } from "../db/schema/organizations";
import { db } from "../db/db";
import { workspacesTable } from "../db/schema/workspaces";
import { projectsTable } from "../db/schema/projects";
import { usersTable } from "../db/schema/users";

const entityTableMap = {
  ORGANIZATION: organizationsTable,
  WORKSPACE: workspacesTable,
  PROJECT: projectsTable,
  USER: usersTable,
};

export const extractEntity = async (entity: 'ORGANIZATION' | 'WORKSPACE' | 'PROJECT'| 'USER', idOrSlug: string) => {
  const table = entityTableMap[entity];

  if (!table) {
    throw new Error(`Invalid entity: ${entity}`);
  }

  const [result] = await db
    .select()
    .from(table)
    .where(or(eq(table.id, idOrSlug), eq(table.slug, idOrSlug)));

  return result;
};
