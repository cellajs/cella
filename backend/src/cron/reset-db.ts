import { dataSeed } from '../../seed/data/seed';
import { organizationsSeed } from '../../seed/organizations/seed';
import { userSeed } from '../../seed/user/seed';

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
