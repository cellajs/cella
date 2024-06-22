import { dataSeed } from '../../seed/data/data';
import { organizationsSeed } from '../../seed/organizations/organizations';
import { userSeed } from '../../seed/user/user';

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
