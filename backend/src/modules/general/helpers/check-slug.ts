import { eq } from 'drizzle-orm';
import { db } from '../../../db/db';

import { organizationsTable } from '../../../db/schema/organizations';
import { usersTable } from '../../../db/schema/users';
import type { PageResourceType } from '../../../types/common';
import { workspacesTable } from '../../../db/schema/workspaces';

export const checkSlugAvailable = async (slug: string, type: PageResourceType) => {
  let entity: unknown;

  switch (type) {
    case 'USER':
      [entity] = await db.select().from(usersTable).where(eq(usersTable.slug, slug));
      break;
    case 'ORGANIZATION':
      [entity] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug));
      break;
    case 'WORKSPACE':
      [entity] = await db.select().from(workspacesTable).where(eq(workspacesTable.slug, slug));
      break;
    default:
      return false;
  }

  return !entity;
};
