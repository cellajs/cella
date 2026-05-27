import type { SeedScript } from '../types';
import { seedDb } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { unsubscribeTokensTable } from '#/db/schema/unsubscribe-tokens';
import { usersTable } from '#/db/schema/users';
import { env } from '#/env';
import pc from 'picocolors';
import { appConfig } from 'shared';
import { mockAdmin, mockEmail, mockUnsubscribeToken } from '../../mocks/mock-user';
import { setMockContext } from '../../mocks/utils';
import { defaultAdminUser } from '../fixtures';
import { systemRolesTable } from '#/db/schema/system-roles';
import { checkMark } from '#/utils/console';

// Set mock context for seed script - UUIDs get '00000000-' prefix, nanoids get 'gen-' prefix (CDC worker skips these on catch-up)
setMockContext('script');

const isProduction = appConfig.mode === 'production';

// Seed scripts use admin connection for privileged operations
const db = seedDb;

const isUserSeeded = async () => {
  const usersInTable = await db
    .select()
    .from(usersTable)
    .limit(1);

  return usersInTable.length > 0;
};

/**
 * Seed an admin user to access app first time.
 * Works in all environments:
 * - Development: uses fixtures (admin-test@cellajs.com)
 * - Production: uses ADMIN_EMAIL env var
 */
export const initSeed = async () => {
  // Determine admin email: env var takes precedence, then fixture default
  const adminEmail = env.ADMIN_EMAIL ?? defaultAdminUser.email;

  // In production, ADMIN_EMAIL is required
  if (isProduction && !env.ADMIN_EMAIL) {
    return console.error('ADMIN_EMAIL environment variable is required for production seeding.');
  }

  // Records already exist → skip seeding
  if (await isUserSeeded()) return console.warn('Users table is not empty → skip seeding');

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

  // Make unsubscribeToken record → Insert into the database
  const unsubscribeTokenRecord = await mockUnsubscribeToken(adminUser);
  await db.insert(unsubscribeTokensTable).values(unsubscribeTokenRecord).onConflictDoNothing();

  // Make email record → Insert into the database
  const emailRecord = mockEmail(adminUser);
  await db
    .insert(emailsTable)
    .values(emailRecord)
    .onConflictDoNothing();

  if (isProduction) {
    console.info(
      ` \n${checkMark} Created admin user with email ${pc.bold(pc.greenBright(adminUser.email))}: use magic link by email to sign in\n `,
    );
  } else {
    console.info(
      ` \n${checkMark} Created admin user with email ${pc.bold(pc.greenBright(adminUser.email))}: use magic link by email to sign in\n `,
    );
  }
};

export const seedConfig: SeedScript = { name: 'init', run: initSeed, allowProduction: true };
