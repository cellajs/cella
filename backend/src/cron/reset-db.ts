import { organizationsSeed, userSeed } from '../../seed';
import { dataSeed } from '../../seed/data';
import { db } from '../db/db';
import { organizationsTable } from '../db/schema/organizations';
import { usersTable } from '../db/schema/users';

export const resetDb = async () => {
  await db.delete(organizationsTable);
  await db.delete(usersTable);

  console.info('Deleted all organizations and users.');

  await userSeed();
  await organizationsSeed();
  await dataSeed();

  console.info('Database reset complete.');
};
