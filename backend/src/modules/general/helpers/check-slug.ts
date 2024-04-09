import { eq } from 'drizzle-orm';
import { db } from '../../../db/db';

import { organizationsTable } from '../../../db/schema/organizations';
import { usersTable } from '../../../db/schema/users';

export const checkSlugAvailable = async (slug: string) => {
  const [user] = await db.select().from(usersTable).where(eq(usersTable.slug, slug));
  const [organization] = await db.select().from(organizationsTable).where(eq(organizationsTable.slug, slug));

  return !user && !organization;
};
