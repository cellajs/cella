import { organizationsAndMembersSeed } from '../../seed';
import { usersSeed } from '../../seed';
import { db } from '../db/db';
import { organizationsTable, usersTable } from '../db/schema';

export const resetDb = async () => {
  await db.delete(organizationsTable);
  await db.delete(usersTable);

  console.log('Deleted all organizations and users.');

  await usersSeed();
  await organizationsAndMembersSeed();

  console.log('Database reset complete.');
};
