import { config } from 'config';
import { db } from '#/db/db';
import { usersTable } from '#/db/schema/users';

import { faker } from '@faker-js/faker';
import chalk from 'chalk';
import { emailsTable } from '#/db/schema/emails';
import { hashPassword } from '#/modules/auth/helpers/argon2id';
import { generateUnsubscribeToken } from '#/modules/users/helpers/unsubscribe-token';

export const adminUser = {
  password: '12345678',
  email: 'admin-test@cellajs.com',
  id: 'admin12345678',
};

/**
 * Seed an admin user to access app first time
 */
export const userSeed = async () => {
  if (config.mode === 'production') return console.error('Not allowed in production.');

  const usersInTable = await db.select().from(usersTable).limit(1);

  if (usersInTable.length > 0) return console.warn('Users table is not empty, skipping seed');

  // Create admin user
  await db
    .insert(usersTable)
    .values({
      id: adminUser.id,
      email: adminUser.email,
      name: 'Admin User',
      language: config.defaultLanguage,
      slug: 'admin-user',
      role: 'admin',
      unsubscribeToken: generateUnsubscribeToken(adminUser.email),
      hashedPassword: await hashPassword(adminUser.password),
    })
    .onConflictDoNothing();

  // Create admin user email
  await db
    .insert(emailsTable)
    .values({
      email: adminUser.email,
      userId: adminUser.id,
      verified: true,
      verifiedAt: faker.date.past().toISOString(),
    })
    .onConflictDoNothing();

  console.info(' ');
  console.info(
    `${chalk.greenBright.bold('✔')} Created admin user with verified email ${chalk.greenBright.bold(adminUser.email)} and password ${chalk.greenBright.bold(adminUser.password)}.`,
  );
  console.info(' ');
};
