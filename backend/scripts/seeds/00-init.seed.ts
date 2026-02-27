import type { SeedScript } from '../types';
import { migrationDb } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { passwordsTable } from '#/db/schema/passwords';
import { tenantsTable } from '#/db/schema/tenants';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { env } from '#/env';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { mockAdmin, mockEmail, mockPassword, mockUnsubscribeToken } from '../../mocks/mock-user';
import { setMockContext } from '../../mocks/utils';
import { defaultAdminUser } from '../fixtures';
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
};

/**
 * Seed an admin user to access app first time.
 * Works in all environments:
 * - Development: uses fixtures (admin-test@cellajs.com / 12345678)
 * - Production: uses ADMIN_EMAIL env var, no password (use "forgot password" or OAuth to sign in)
 */
export const initSeed = async () => {
  // Determine admin email: env var takes precedence, then fixture default
  const adminEmail = env.ADMIN_EMAIL ?? defaultAdminUser.email;

  // In production, ADMIN_EMAIL is required
  if (isProduction && !env.ADMIN_EMAIL) {
    return console.error('ADMIN_EMAIL environment variable is required for production seeding.');
  }

  // Admin connection required
  if (!db) return console.error('DATABASE_ADMIN_URL required for seeding');

  // Records already exist → skip seeding
  if (await isUserSeeded()) return console.warn('Users table is not empty → skip seeding');

  // Create public tenant (needed for pages and other platform-wide content)
  await db.insert(tenantsTable).values({ id: appConfig.publicTenant.id, name: appConfig.publicTenant.name }).onConflictDoNothing();

  // Make admin user → Insert into the database
  const adminId = isProduction ? undefined : defaultAdminUser.id;
  const adminRecord = mockAdmin(adminId, adminEmail);

  const [adminUser] = await db
    .insert(usersTable)
    .values(adminRecord)
    .returning()
    .onConflictDoNothing();

  // Insert system role record into the database
  await db.insert(systemRolesTable).values({ userId: adminUser.id, role: 'admin' }).onConflictDoNothing();

  // In dev, set a default password. In production, skip password (use "forgot password" or OAuth to sign in)
  if (!isProduction) {
    const { hashPassword } = await import('#/modules/auth/passwords/helpers/argon2id');
    const hashed = await hashPassword(defaultAdminUser.password);
    const passwordRecord = mockPassword(adminUser, hashed);
    await db.insert(passwordsTable).values(passwordRecord).onConflictDoNothing();
  }

  // Make unsubscribeToken record → Insert into the database
  const unsubscribeTokenRecord = mockUnsubscribeToken(adminUser);
  await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecord).onConflictDoNothing();

  // Make email record → Insert into the database
  const emailRecord = mockEmail(adminUser);
  await db
    .insert(emailsTable)
    .values(emailRecord)
    .onConflictDoNothing();

  if (isProduction) {
    console.info(
      ` \n${checkMark} Created admin user with email ${pc.bold(pc.greenBright(adminUser.email))}: use "forgot password" or OAuth to sign in\n `,
    );
  } else {
    console.info(
      ` \n${checkMark} Created admin user with email ${pc.bold(pc.greenBright(adminUser.email))} and password ${pc.bold(pc.greenBright(defaultAdminUser.password))}\n `,
    );
  }
};

export const seedConfig: SeedScript = { name: 'init', run: initSeed, allowProduction: true };
