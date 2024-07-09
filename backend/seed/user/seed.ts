import { config } from 'config';
import { db } from '../../src/db/db';
import { usersTable } from '../../src/db/schema/users';

import { Argon2id } from 'oslo/password';

export const adminUser = {
  password: '12345678',
  email: 'admin-test@cellajs.com',
  id: 'admin12345678',
};

// Seed an admin user to access app first time
export const userSeed = async () => {
  const usersInTable = await db.select().from(usersTable).limit(1);

  if (usersInTable.length > 0) {
    console.info('Users table is not empty, skipping seed');
    return;
  }

  await db
    .insert(usersTable)
    .values({
      id: adminUser.id,
      email: adminUser.email,
      emailVerified: true,
      name: 'Admin User',
      language: config.defaultLanguage,
      slug: 'admin-user',
      role: 'admin',
      hashedPassword: await new Argon2id().hash(adminUser.password),
    })
    .onConflictDoNothing();

  console.info(`Created admin user with verified email ${adminUser.email} and password ${adminUser.password}.`);
};
