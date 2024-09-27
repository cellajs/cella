import { config } from 'config';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';

import { hashPasswordWithArgon } from '#/modules/auth/helpers/argon2id';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';

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
      unsubscribeToken: generateUnsubscribeToken(adminUser.email),
      hashedPassword: await hashPasswordWithArgon(adminUser.password),
    })
    .onConflictDoNothing();

  console.info(`Created admin user with verified email ${adminUser.email} and password ${adminUser.password}.`);
};
