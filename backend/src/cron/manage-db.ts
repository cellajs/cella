import { dataSeed } from '../../scripts/seeds/data/seed';
import { organizationsSeed } from '../../scripts/seeds/organizations/seed';
import { userSeed } from '../../scripts/seeds/user/seed';

import { db } from '#/db/db';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';

export const resetDb = async () => {
  await deleteTables();

  // Reset the database with seeds
  await userSeed();
  await organizationsSeed();
  await dataSeed();

  console.info('Database reset complete.');
};

export const clearDb = async () => {
  await deleteTables();
  console.info('Database clearing complete.');
};

const deleteTables = async () => {
  await db.delete(organizationsTable);
  await db.delete(usersTable);

  console.info('Deleted all organizations and users.');
};
