import { eq } from 'drizzle-orm';
import pc from 'picocolors';
import { generateId } from 'shared/utils/entity-id';
import { getSeedDb } from '#/db/db';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { systemRolesTable } from '#/modules/system/system-roles-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';
import { mockAdmin, mockEmail } from '#/modules/user/user-mocks';
import { insertUsers } from '#/modules/user/user-queries';
import { checkMark, durationSuffix } from '#/utils/console';
import { defaultAdminUser, defaultAgentUser } from '../fixtures';
import type { SeedScript } from '../types';
import { toBatches } from './seed-volume';

// Seed scripts use admin connection for privileged operations
const db = getSeedDb();

/**
 * Seeds the user agents sign in as: a system admin with a copy of the default admin's memberships, so an agent sees
 * what the developer sees without spending their per-user budgets, sessions or unseen marks. Runs after the seeds that
 * give the admin memberships and before the counters. A later run adds the memberships the admin gained since, so
 * `pnpm seed agent` brings a database seeded before it up to date.
 */
export const agentSeed = async () => {
  const startedAt = performance.now();

  const [admin] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.id, defaultAdminUser.id));
  if (!admin) return console.warn('No default admin to copy → skip seeding the agent user');

  const agentRecord = {
    ...mockAdmin(defaultAgentUser.id, defaultAgentUser.email),
    givenName: 'Agent',
    name: 'Agent User',
    slug: 'agent-user',
  };
  await insertUsers({ var: { db } }, { users: [agentRecord], onConflictDoNothing: true });
  await db.insert(systemRolesTable).values({ userId: defaultAgentUser.id, role: 'admin' }).onConflictDoNothing();
  await db.insert(emailsTable).values(mockEmail(defaultAgentUser)).onConflictDoNothing();

  const adminMemberships = await db.select().from(membershipsTable).where(eq(membershipsTable.userId, defaultAdminUser.id));
  const copies = adminMemberships.map(({ id, ...membership }) => ({ ...membership, id: generateId(), userId: defaultAgentUser.id }));

  let added = 0;
  for (const batch of toBatches(copies)) {
    added += (await db.insert(membershipsTable).values(batch).onConflictDoNothing().returning({ id: membershipsTable.id })).length;
  }

  console.info(`${checkMark} Agent user ${pc.bold(defaultAgentUser.email)} holds ${added} new memberships of the admin${durationSuffix(startedAt)}`);
};

export const seedConfig: SeedScript = { name: 'agent', run: agentSeed };
