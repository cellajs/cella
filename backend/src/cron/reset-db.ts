import { specificDataSeed } from '../../seed/app-specific/index';
import { userSeed, templateDataSeed } from '../../seed/template/index';
import { db } from '../db/db';
import { organizationsTable } from '../db/schema/organizations';
import { usersTable } from '../db/schema/users';

export const resetDb = async () => {
  await db.delete(organizationsTable);
  await db.delete(usersTable);

  console.info('Deleted all organizations and users.');

  await userSeed();
  await templateDataSeed();
  await specificDataSeed();

  console.info('Database reset complete.');
};
