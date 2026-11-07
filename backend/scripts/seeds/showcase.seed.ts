import { getRandomValues } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { faker } from '@faker-js/faker';
import { desc, eq, inArray, sql } from 'drizzle-orm';
import { appConfig, hierarchy, isSeenTracked, seenWindowMs } from 'shared';
import { localDatabaseUrl } from 'shared/local-database';
import slugify from 'slugify';
import { getSeedDb } from '#/db/db';
import { updateStamps } from '#/db/utils/stamps';
import { env } from '#/env';
import { mockUuid, setMockContext, withFakerSeed } from '#/mocks';
import { actorsTable } from '#/modules/actors/actors-db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { type AttachmentSeedPlacement, seedAttachmentPlacements } from '#/modules/attachment/attachment-placement';
import { passkeysTable } from '#/modules/auth/passkeys/passkeys-db';
import { insertTotp } from '#/modules/auth/totps/totps-queries';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { mockChannelMembership } from '#/modules/memberships/memberships-mocks';
import { notificationsTable } from '#/modules/notification/notification-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { insertSeenBy } from '#/modules/seen/seen-queries';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { mockEmail, mockUser } from '#/modules/user/user-mocks';
import { insertUsers, updateUser } from '#/modules/user/user-queries';
import { encodeBase32 } from '#/utils/base32';
import { checkMark, startSpinner, succeedSpinner } from '#/utils/console';
import { defaultAdminUser } from '../fixtures';
import type { SeedScript } from '../types';
import { initSeed } from './00-init.seed';
import { seedAttachmentRecord } from './20-attachment.seed';
import { countersSeed } from './50-counters.seed';
import { notificationsSeed } from './55-notifications.seed';
import { textDocument } from './description-document';
import { seedAssets } from './seed-assets';
import { seedAppShowcase } from './showcase.app';
import showcaseJson from './showcase.json' with { type: 'json' };

setMockContext('script');

const db = getSeedDb();
const ctx = { var: { db } };
const adminId = defaultAdminUser.id;

/** `showcase.json`. An age is a duration before the run: 25min, 2h, 3d, 1w, 5mo or 2y. */
interface Showcase {
  /** The account the screenshots sign in as, the init seed's admin under this name. */
  admin: { givenName: string; familyName: string; email: string; age: string };
  /** Share of the generated members with MFA on. */
  mfaShare: number;
  /** Mentions of the admin left unread. */
  unreadNotifications: number;
  organizations: {
    name: string;
    age: string;
    /** The admin's membership; without one the admin is outside the organization. */
    membership?: { role: string; archived?: boolean };
    /** Members per role, the admin and `people` included; generated members take the other seats. */
    roles: Record<string, number>;
    attachments: number;
    /** The newest attachments the admin has not seen; the others inside the seen window are seen. */
    unseen?: number;
    /** Email domain of `people`. */
    domain?: string;
    /** Named members, the rows a members table lists first. A null `lastSeen` never signed in. */
    people?: { name: string; role: string; mfa: boolean; lastSeen: string | null }[];
  }[];
}
type ShowcaseOrganization = Showcase['organizations'][number];

/** What the app's `seedAppShowcase` gets: the organizations in `json/showcase.json` order, with their members in place. */
export interface ShowcaseSeeded {
  adminId: string;
  organizations: ReturnType<typeof planOrganization>[];
}

const showcase: Showcase = showcaseJson;

const durations = new Map([
  ['min', 60_000],
  ['h', 3_600_000],
  ['d', 86_400_000],
  ['w', 604_800_000],
  ['mo', 2_592_000_000],
  ['y', 31_536_000_000],
]);

/** The time `ago` before the run. */
const timeAgo = (ago: string) => {
  const [, amount, unit] = /^(\d+)([a-z]+)$/.exec(ago) ?? [];
  const ms = unit ? durations.get(unit) : undefined;
  if (!ms) throw new Error(`showcase.json: "${ago}" is no duration (25min, 2h, 3d, 1w, 5mo or 2y)`);
  return new Date(Date.now() - Number(amount) * ms).toISOString();
};

/** A time between `from` and now: uniform at `recency` 1, closer to now as it grows. */
const sinceThen = (from: string, recency = 1) =>
  new Date(Date.now() - (Date.now() - Date.parse(from)) * faker.number.float() ** recency).toISOString();

const organizationRole = (role: string) => {
  const match = hierarchy.getRoles('organization').find((declared) => declared === role);
  if (!match) throw new Error(`showcase.json: the organization declares no role "${role}"`);
  return match;
};

const slug = (text: string) => slugify(text, { lower: true, strict: true });

/** Refuses a database someone works in: the admin gets factors nobody holds, and the data would mix with theirs. */
const refuseOwnDatabase = () => {
  const envFile = new URL('../../.env', import.meta.url);
  const fileEnv = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
  // The app's showcase rows go through its operations, which write on the runtime pool
  const own =
    env.DATABASE_ADMIN_URL === (fileEnv.DATABASE_ADMIN_URL ?? localDatabaseUrl('dev', 'postgres')) ||
    env.DATABASE_URL === (fileEnv.DATABASE_URL ?? localDatabaseUrl('dev', 'runtime_role'));
  if (own) {
    throw new Error('the showcase refuses the database backend/.env names: set DATABASE_URL and DATABASE_ADMIN_URL to a throwaway one.');
  }
  if ((env.ADMIN_EMAIL ?? defaultAdminUser.email) !== showcase.admin.email) {
    throw new Error(`the showcase admin is ${showcase.admin.email}: export ADMIN_EMAIL=${showcase.admin.email}.`);
  }
};

/** An organization with its tenant and members, drawn from a faker seeded by its name: a re-seed draws the same ids and people. */
const planOrganization = (org: ShowcaseOrganization, adminOrder: number) =>
  withFakerSeed(`showcase:${org.name}`, () => {
    const createdAt = timeAgo(org.age);
    const id = mockUuid();
    const organization = {
      ...mockOrganization({ id, name: org.name, createdAt }),
      createdBy: adminId,
      welcomeText: textDocument(`Welcome to ${org.name}!`),
    };
    const channel = { id, tenantId: organization.tenantId };

    const openSeats = new Map(Object.entries(org.roles));
    const takeSeat = (role: string) => {
      const left = (openSeats.get(role) ?? 0) - 1;
      if (left < 0) throw new Error(`showcase.json: ${org.name} names more "${role}" members than its roles count`);
      openSeats.set(role, left);
      return organizationRole(role);
    };

    const newMember = (
      overrides: { givenName?: string; familyName?: string; email?: string; mfaRequired: boolean },
      role: string,
      lastSeenAt: string | null,
    ) => {
      const joinedAt = sinceThen(createdAt);
      const mock = { ...mockUser({ email: overrides.email }), ...overrides };
      // Given and family name only: faker's full names carry titles such as "Miss" or "PhD"
      const name = [mock.givenName, mock.familyName].filter(Boolean).join(' ');
      const user = { ...mock, name, slug: overrides.givenName ? slug(name) : mock.slug, id: mockUuid(), createdAt: joinedAt, updatedAt: joinedAt };
      const membership = { ...mockChannelMembership('organization', channel, user), role: takeSeat(role), createdAt: joinedAt };
      return { user, membership, lastSeenAt };
    };

    const adminMembership = org.membership && {
      ...mockChannelMembership('organization', channel, { id: adminId }),
      role: takeSeat(org.membership.role),
      archived: org.membership.archived ?? false,
      displayOrder: adminOrder,
      createdAt,
    };

    const people = (org.people ?? []).map(({ name, role, mfa, lastSeen }) => {
      const [givenName, ...rest] = name.split(' ');
      if (!org.domain) throw new Error(`showcase.json: ${org.name} names people without a domain`);
      return newMember(
        { givenName, familyName: rest.join(' '), email: `${slug(givenName)}@${org.domain}`, mfaRequired: mfa },
        role,
        lastSeen && timeAgo(lastSeen),
      );
    });

    // Most generated members came by recently, a few never signed in
    const generated = [...openSeats].flatMap(([role, seats]) =>
      Array.from({ length: seats }, () =>
        newMember({ mfaRequired: faker.datatype.boolean(showcase.mfaShare) }, role, faker.datatype.boolean(0.85) ? sinceThen(createdAt, 3) : null),
      ),
    );

    return { org, organization, channel, createdAt, adminMembership, members: [...people, ...generated] };
  });

/** Attachments by the organization's members, most of them recent. */
const planAttachments = (org: ShowcaseOrganization, homes: AttachmentSeedPlacement[], creatorIds: string[], createdAt: string) =>
  withFakerSeed(`showcase:${org.name}:attachments`, () =>
    Array.from({ length: org.attachments }, (_, i) =>
      seedAttachmentRecord(
        seedAssets[i % seedAssets.length],
        homes[i % homes.length],
        sinceThen(createdAt, 2),
        faker.helpers.arrayElement(creatorIds),
      ),
    ),
  );

/** The admin under the showcase name, with MFA on through a passkey and an authenticator app nobody can sign in with. */
const finishAdmin = async () => {
  const { givenName, familyName, age } = showcase.admin;
  await updateUser(ctx, {
    id: adminId,
    values: { givenName, familyName, name: `${givenName} ${familyName}`, mfaRequired: true, createdAt: timeAgo(age), ...updateStamps(adminId) },
  });

  const randomKey = () => encodeBase32(getRandomValues(new Uint8Array(20)));
  await db.insert(passkeysTable).values({
    userId: adminId,
    credentialId: `showcase-${adminId}`,
    publicKey: randomKey(),
    deviceName: 'MacBook Pro',
    deviceType: 'desktop',
    deviceOs: 'macOS',
    browser: 'Chrome',
    nameOnDevice: `${showcase.admin.email} (Swift Phoenix)`,
  });
  // Last used two hours ago: the account page shows the step as a time, and step 0 reads as 1970
  const lastUsedStep = Math.floor((Date.now() - 2 * 3_600_000) / 1000 / appConfig.totp.intervalInSeconds);
  await insertTotp(ctx, { userId: adminId, secret: randomKey(), lastUsedStep });
};

/** Leaves the newest `unread` mentions of the admin unread and the others read, whatever the notification seed drew. */
const readAllBut = async (unread: number) => {
  const newest = await db
    .select({ id: notificationsTable.id })
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, adminId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(unread);
  const newestIds = newest.map(({ id }) => id);
  await db
    .update(notificationsTable)
    .set({ readAt: sql`case when ${inArray(notificationsTable.id, newestIds)} then null else ${notificationsTable.createdAt} end` })
    .where(eq(notificationsTable.userId, adminId));
};

/**
 * Seeds the curated dataset of `json/showcase.json` that the marketing screenshots show, in place of the random seed:
 * a dozen organizations, their members and attachments, the app's own rows (`showcase.app.ts`), the admin's menu, unseen
 * counts and inbox, and MFA. Runs only when named, on an empty throwaway database.
 */
export const showcaseSeed = async () => {
  const [existing] = await db.select({ id: organizationsTable.id }).from(organizationsTable).limit(1);
  if (existing) throw new Error('The showcase seeds an empty database: this one holds organizations.');
  await initSeed();
  startSpinner('Seeding the showcase...');

  const seenFrom = new Date(Date.now() - seenWindowMs).toISOString();
  let people = 0;
  let attachments = 0;

  const seeded: ShowcaseSeeded['organizations'] = [];
  for (const [index, org] of showcase.organizations.entries()) {
    const planned = planOrganization(org, 1 + index * 10);
    const { organization, channel, adminMembership, members } = planned;

    await db.insert(tenantsTable).values({ id: channel.tenantId, name: org.name, createdBy: adminId });
    await db.insert(organizationsTable).values(organization);
    await insertUsers(ctx, { users: members.map(({ user }) => user) });
    await db.insert(emailsTable).values(members.map(({ user }) => mockEmail(user)));
    await db.insert(membershipsTable).values([...(adminMembership ? [adminMembership] : []), ...members.map(({ membership }) => membership)]);
    for (const { user, lastSeenAt } of members) {
      if (lastSeenAt) await db.update(actorsTable).set({ lastSeenAt }).where(eq(actorsTable.id, user.id));
    }
    seeded.push(planned);
    people += members.length;
  }

  // Before the attachments: an app may home them in channels its own rows create
  await seedAppShowcase({ adminId, organizations: seeded });

  for (const { org, channel, createdAt, adminMembership, members } of seeded) {
    const homes = await seedAttachmentPlacements(db, [channel]);
    if (!homes.length) continue;
    const records = planAttachments(
      org,
      homes,
      members.map(({ user }) => user.id),
      createdAt,
    );
    await db.insert(attachmentsTable).values(records);

    // The newest attachments stay unseen in the admin's menu; the window's others count as seen
    const productType = 'attachment';
    if (adminMembership && isSeenTracked(productType)) {
      const seen = records
        .toSorted((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(adminMembership.archived ? 0 : (org.unseen ?? 0))
        .filter(({ createdAt }) => createdAt > seenFrom)
        .map(({ id }) => id);
      if (seen.length) await db.transaction((tx) => insertSeenBy({ var: { db: tx } }, { userId: adminId, productType, productIds: seen }));
    }

    attachments += records.length;
  }

  await finishAdmin();
  succeedSpinner(`Showcase: ${showcase.organizations.length} organizations, ${people} members, ${attachments} attachments`);

  await countersSeed();
  await notificationsSeed();
  await readAllBut(showcase.unreadNotifications);
  console.info(`${checkMark} Marked all but the newest ${showcase.unreadNotifications} mentions read`);
};

export const seedConfig: SeedScript = { name: 'showcase', run: showcaseSeed, explicit: true, precheck: refuseOwnDatabase };
