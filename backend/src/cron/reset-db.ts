import { dataSeed, userSeed } from '../../seed';
import { db } from '../db/db';
import { organizationsTable } from '../db/schema/organizations';
import { usersTable } from '../db/schema/users';

export const resetDb = async () => {
  await db.delete(organizationsTable);
  await db.delete(usersTable);

  console.info('Deleted all organizations and users.');

  await userSeed();
  await dataSeed();

  console.info('Database reset complete.');
};
