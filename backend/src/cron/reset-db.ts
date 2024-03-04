import { organizationsAndMembersSeed, usersSeed } from '../../seed';
import { db } from '../db/db';
import { organizationsTable } from '../db/schema/organizations';
import { usersTable } from '../db/schema/users';

export const resetDb = async () => {
  await db.delete(organizationsTable);
  await db.delete(usersTable);

  console.info('Deleted all organizations and users.');

  await usersSeed();
  await organizationsAndMembersSeed();

  console.info('Database reset complete.');
};
