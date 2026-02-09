import { migrationDb } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { tenantsTable } from '#/db/schema/tenants';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { hashPassword } from '#/modules/auth/passwords/helpers/argon2id';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { mockAdmin, mockEmail, mockPassword, mockUnsubscribeToken } from '../../../mocks/mock-user';
import { setMockContext } from '../../../mocks/utils';
import { defaultAdminUser, systemTenant } from '../fixtures';
import { systemRolesTable } from '#/db/schema/system-roles';
import { checkMark } from '#/utils/console';

// Set mock context for seed script - IDs will get 'gen-' prefix (CDC worker skips these)
setMockContext('script');

const isProduction = appConfig.mode === 'production';

// Seed scripts use admin connection (migrationDb) for privileged operations
const db = migrationDb;

const isUserSeeded = async () => {
  if (!db) return true; // Skip if no admin connection
  const usersInTable = await db
    .select()
    .from(usersTable)
    .limit(1);

  return usersInTable.length > 0;
}

/**
 * Seed an admin user to access app first time
 */
export const userSeed = async () => {
  // Production mode → skip seeding
  if (isProduction) return console.error('Not allowed in production.');

  // Admin connection required
  if (!db) return console.error('DATABASE_ADMIN_URL required for seeding');

  // Records already exist → skip seeding
  if (await isUserSeeded()) return console.warn('Users table is not empty → skip seeding');

  // Create system tenant (needed for pages and other platform-wide content)
  await db.insert(tenantsTable).values({ id: systemTenant.id, name: systemTenant.name }).onConflictDoNothing();

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
  await db.insert(systemRolesTable).values({ userId: adminUser.id, role: 'admin' }).onConflictDoNothing();

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
    ` \n${checkMark} Created admin user with verified email ${pc.bold(pc.greenBright(adminUser.email))} and password ${pc.bold(pc.greenBright(defaultAdminUser.password))}.\n `,
  );
};
