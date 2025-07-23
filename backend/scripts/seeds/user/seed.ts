import chalk from 'chalk';
import { config } from 'config';
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { usersTable } from '#/db/schema/users';
import { defaultAdminUser } from '../common/admin';
import { isUserAlreadySeeded as isAlreadySeeded } from '../common/is-already-seeded';
import { AdminSeeder } from '../common/admin-seeder';
import { EmailSeeder } from '../common/email-seeder';
import { hashPassword } from '#/modules/auth/helpers/argon2id';

/**
 * Seed an admin user to access app first time
 */
export const userSeed = async () => {
  // Case: Production mode → skip seeding
  if (config.mode === 'production') return console.error('Not allowed in production.');

  // Case: Records already exist → skip seeding
  if (await isAlreadySeeded()) return console.warn('Users table is not empty → skip seeding');

  // Hash default admin password
  const hashed = await hashPassword(defaultAdminUser.password);

  // Make admin user → Insert into the database  
  const adminSeeder = new AdminSeeder(
    defaultAdminUser.id,
    defaultAdminUser.email,
    hashed,
  );
  const adminRecord = adminSeeder.make();

  const [adminUser] = await db
    .insert(usersTable)
    .values(adminRecord)
    .returning()
    .onConflictDoNothing();

  // Make email record → Insert into the database
  const emailSeeder = new EmailSeeder();
  const emailRecord = emailSeeder.make(adminUser);

  await db
    .insert(emailsTable)
    .values(emailRecord)
    .onConflictDoNothing();

  console.info(
    ` \n${chalk.greenBright.bold('✔')} Created admin user with verified email ${chalk.greenBright.bold(adminUser.email)} and password ${chalk.greenBright.bold(defaultAdminUser.password)}.\n `,
  );
};
