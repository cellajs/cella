import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { hashPassword } from '#/modules/auth/passwords/helpers/argon2id';
import chalk from 'chalk';
import { appConfig } from 'config';
import { mockAdmin, mockEmail, mockPassword, mockUnsubscribeToken } from '../../../mocks/basic';
import { defaultAdminUser } from '../fixtures';
import { isUserSeeded as isAlreadySeeded } from '../utils';
import { systemRolesTable } from '#/db/schema/system-roles';

/**
 * Seed an admin user to access app first time
 */
export const userSeed = async () => {
  // Case: Production mode → skip seeding
  if (appConfig.mode === 'production') return console.error('Not allowed in production.');

  // Case: Records already exist → skip seeding
  if (await isAlreadySeeded()) return console.warn('Users table is not empty → skip seeding');

  // Hash default admin password
  const hashed = await hashPassword(defaultAdminUser.password);

  // Make admin user → Insert into the database  
  const adminRecord = mockAdmin(defaultAdminUser.id, defaultAdminUser.email);

  const [adminUser] = await db
    .insert(usersTable)
    .values(adminRecord)
    .returning()
    .onConflictDoNothing();

  // Insert system role record into the database
  await db.insert(systemRolesTable).values({userId:adminUser.id, role: 'admin' }).onConflictDoNothing();

  // Make password record → Insert into the database
  const passwordRecord = mockPassword(adminUser, hashed);
  await db.insert(passwordsTable).values(passwordRecord).onConflictDoNothing();

  // Make unsubscribeToken record → Insert into the database
  const unsubscribeTokenRecord = mockUnsubscribeToken(adminUser);
  await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecord).onConflictDoNothing();

  // Make email record → Insert into the database
  const emailRecord = mockEmail(adminUser);
  await db
    .insert(emailsTable)
    .values(emailRecord)
    .onConflictDoNothing();

  console.info(
    ` \n✅ Created admin user with verified email ${chalk.greenBright.bold(adminUser.email)} and password ${chalk.greenBright.bold(defaultAdminUser.password)}.\n `,
  );
};
