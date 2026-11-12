import { and, eq, inArray, like, sql } from 'drizzle-orm';
import { appConfig } from 'shared';
import { generateId } from 'shared/utils/entity-id';
import { nanoid } from 'shared/utils/nanoid';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { devicesTable } from '#/modules/auth/devices/devices-db';
import { rateLimitsTable } from '#/modules/auth/rate-limits-db';
import { sessionsTable } from '#/modules/auth/sessions/sessions-db';
import { tokensTable } from '#/modules/auth/tokens/tokens-db';
import { inactiveMembershipsTable } from '#/modules/memberships/inactive-memberships-db';
import { oidcPayloadsTable } from '#/modules/oauth-server/oidc-payloads-db';
import { pushSubscriptionsTable } from '#/modules/push/push-subscription-db';
import { requestsTable } from '#/modules/requests/requests-db';
import { hashDeviceIdForUser } from '#/utils/hash-pii';
import { unreferencedBatchSql } from '../scripts/migrations/10-retention.migration';
import { memberRole } from './fixtures';
import { createTestOrganization, createTestUser, adminDb as db, insertTestSession, insertTestToken } from './helpers';
import { cleanupEntityHierarchy, insertAttachmentRow, seedAttachmentHome } from './hierarchy-helpers';
import { clearDatabase } from './test-utils';

const { retention } = appConfig;
const day = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * day);
// A day either side of the line, so a slow run never crosses it.
const inside = (period: number) => ago(period - 1);
const outside = (period: number) => ago(period + 1);

/** The ids a rule must keep and the ids it must remove, read back after the run. */
interface RuleCase {
  rule: string;
  remaining: () => Promise<string[]>;
  kept: string[];
  removed: string[];
}

/**
 * Every row rule of `apply_retention()`: a row just inside its period stays, one just outside goes. The procedure
 * deletes personal data nothing can bring back, so each rule is checked against rows, under the admin role pg_cron
 * runs it as.
 */
describe('apply_retention() row rules', () => {
  const cases: RuleCase[] = [];
  const cleanups: (() => Promise<void>)[] = [];

  beforeAll(async () => {
    const user = await createTestUser('retention-rules@example.com');
    const crowded = await createTestUser('retention-cap@example.com');
    const organization = await createTestOrganization();

    const sessions = {
      gone: await insertTestSession(user, { expiresInMs: -(retention.sessionDaysAfterExpiry + 1) * day }),
      kept: await insertTestSession(user, { expiresInMs: -(retention.sessionDaysAfterExpiry - 1) * day }),
    };
    cases.push({
      rule: 'sessions',
      remaining: async () =>
        (await db.select({ id: sessionsTable.id }).from(sessionsTable).where(eq(sessionsTable.userId, user.id))).map((row) => row.id),
      kept: [sessions.kept.id],
      removed: [sessions.gone.id],
    });

    const tokens = {
      gone: (await insertTestToken('magic', user, { expiresInMs: -(retention.tokenDaysAfterExpiry + 1) * day })).row,
      kept: (await insertTestToken('magic', user, { expiresInMs: -(retention.tokenDaysAfterExpiry - 1) * day })).row,
    };
    cases.push({
      rule: 'tokens',
      remaining: async () => (await db.select({ id: tokensTable.id }).from(tokensTable).where(eq(tokensTable.userId, user.id))).map((row) => row.id),
      kept: [tokens.kept.id],
      removed: [tokens.gone.id],
    });

    const device = (userId: string, lastSeen: Date) => {
      const deviceIdHash = hashDeviceIdForUser(nanoid(24), userId);
      return db
        .insert(devicesTable)
        .values({ userId, deviceIdHash, firstSeenAt: lastSeen.toISOString(), lastSeenAt: lastSeen.toISOString() })
        .then(() => deviceIdHash);
    };
    const devicesOf = (userId: string) => async () =>
      (await db.select({ hash: devicesTable.deviceIdHash }).from(devicesTable).where(eq(devicesTable.userId, userId))).map((row) => row.hash);
    const unseen = {
      gone: await device(user.id, outside(retention.deviceDaysUnseen)),
      kept: await device(user.id, inside(retention.deviceDaysUnseen)),
    };
    cases.push({ rule: 'devices unseen', remaining: devicesOf(user.id), kept: [unseen.kept], removed: [unseen.gone] });
    // Minutes apart and recent, so only the cap decides; the two least recently seen go.
    const crowdedDevices: string[] = [];
    for (let i = 0; i < retention.devicesPerUser + 2; i++) crowdedDevices.push(await device(crowded.id, new Date(Date.now() - i * 60_000)));
    cases.push({
      rule: 'devices per user',
      remaining: devicesOf(crowded.id),
      kept: crowdedDevices.slice(0, retention.devicesPerUser),
      removed: crowdedDevices.slice(retention.devicesPerUser),
    });

    const payload = (expiresAt: Date | null, consumedAt: Date | null) => {
      const id = `retention-${nanoid(12)}`;
      return db
        .insert(oidcPayloadsTable)
        .values({ id, type: 'Grant', payload: {}, expiresAt: expiresAt?.toISOString() ?? null, consumedAt: consumedAt?.toISOString() ?? null })
        .then(() => id);
    };
    const soon = new Date(Date.now() + day);
    const payloads = {
      expired: await payload(ago(1), null),
      usedLongAgo: await payload(soon, outside(retention.oidcPayloadDaysAfterUse)),
      usedRecently: await payload(soon, inside(retention.oidcPayloadDaysAfterUse)),
      open: await payload(null, null),
    };
    cases.push({
      rule: 'oidc payloads',
      remaining: async () =>
        (await db.select({ id: oidcPayloadsTable.id }).from(oidcPayloadsTable).where(like(oidcPayloadsTable.id, 'retention-%'))).map((row) => row.id),
      kept: [payloads.usedRecently, payloads.open],
      removed: [payloads.expired, payloads.usedLongAgo],
    });

    const request = async (kind: 'contact' | 'waitlist' | 'info', createdAt: Date) => {
      const id = generateId();
      await db.insert(requestsTable).values({ id, kind, email: `${id}@retention.test`, message: 'hello', createdAt: createdAt.toISOString() });
      return id;
    };
    const requests = {
      oldContact: await request('contact', outside(retention.requestDays)),
      recentContact: await request('contact', inside(retention.requestDays)),
      oldWaitlist: await request('waitlist', outside(retention.requestDays)),
      oldInfo: await request('info', outside(retention.requestDays)),
    };
    cases.push({
      rule: 'requests',
      remaining: async () =>
        (
          await db
            .select({ id: requestsTable.id })
            .from(requestsTable)
            .where(inArray(requestsTable.id, Object.values(requests)))
        ).map((row) => row.id),
      kept: [requests.recentContact],
      removed: [requests.oldContact, requests.oldWaitlist, requests.oldInfo],
    });

    const invitation = async ({ declinedAt = null, remindedAt = null }: { declinedAt?: Date | null; remindedAt?: Date | null }) => {
      const id = generateId();
      await db.insert(inactiveMembershipsTable).values({
        id,
        email: `${id}@retention.test`,
        channelId: organization.id,
        organizationId: organization.id,
        tenantId: organization.tenantId,
        channelType: 'organization' as const,
        role: memberRole,
        createdBy: user.id,
        createdAt: ago(1000).toISOString(),
        declinedAt: declinedAt?.toISOString() ?? null,
        remindedAt: remindedAt?.toISOString() ?? null,
      });
      return id;
    };
    const invitations = {
      declinedLongAgo: await invitation({ declinedAt: outside(retention.invitationDays) }),
      declinedRecently: await invitation({ declinedAt: inside(retention.invitationDays) }),
      mailedLongAgo: await invitation({ remindedAt: outside(retention.invitationDays) }),
      mailedRecently: await invitation({ remindedAt: inside(retention.invitationDays) }),
      held: await invitation({}),
    };
    cases.push({
      rule: 'invitations',
      remaining: async () =>
        (
          await db
            .select({ id: inactiveMembershipsTable.id })
            .from(inactiveMembershipsTable)
            .where(eq(inactiveMembershipsTable.organizationId, organization.id))
        ).map((row) => row.id),
      kept: [invitations.declinedRecently, invitations.mailedRecently, invitations.held],
      removed: [invitations.declinedLongAgo, invitations.mailedLongAgo],
    });

    // The counter runs ahead of every row but `newest`, which holds the organization's latest position.
    const plan = await seedAttachmentHome({ id: organization.id, tenantId: organization.tenantId }, user.id);
    cleanups.push(() => cleanupEntityHierarchy(db, plan));
    await db.execute(sql`INSERT INTO channel_counters (channel_key, counts) VALUES (${organization.id}, '{"sequence": 100}')
      ON CONFLICT (channel_key) DO UPDATE SET counts = channel_counters.counts || '{"sequence": 100}'`);
    const attachment = async (deletedAt: Date | null, seq: number) => {
      const id = generateId();
      const row = { id, tenantId: organization.tenantId, ...plan.channelIdColumns, keys: {}, createdBy: user.id, updatedBy: null, seq };
      await insertAttachmentRow(buildInsertableProduct('attachment', { ...row, deletedAt: deletedAt?.toISOString() ?? null, deletedBy: null }, id));
      return id;
    };
    const tombstones = {
      expired: await attachment(outside(retention.deletedItemsDays), 5),
      recent: await attachment(inside(retention.deletedItemsDays), 6),
      newest: await attachment(outside(retention.deletedItemsDays), 100),
      live: await attachment(null, 7),
    };
    cases.push({
      rule: 'tombstones',
      remaining: async () =>
        (
          await db
            .select({ id: attachmentsTable.id })
            .from(attachmentsTable)
            .where(inArray(attachmentsTable.id, Object.values(tombstones)))
        ).map((row) => row.id),
      kept: [tombstones.recent, tombstones.newest, tombstones.live],
      removed: [tombstones.expired],
    });
    cleanups.push(async () => {
      await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, Object.values(tombstones)));
    });

    const limits = { gone: `retention-test:${nanoid(8)}`, kept: `retention-test:${nanoid(8)}` };
    await db.insert(rateLimitsTable).values([
      { key: limits.gone, points: 1, expire: outside(retention.rateLimitDaysAfterWindow) },
      { key: limits.kept, points: 1, expire: inside(retention.rateLimitDaysAfterWindow) },
    ]);
    cases.push({
      rule: 'rate limits',
      remaining: async () =>
        (await db.select({ key: rateLimitsTable.key }).from(rateLimitsTable).where(like(rateLimitsTable.key, 'retention-test:%'))).map(
          (row) => row.key,
        ),
      kept: [limits.kept],
      removed: [limits.gone],
    });

    const subscription = async (lastSeenAt: Date, createdAt: Date) => {
      const id = generateId();
      await db.insert(pushSubscriptionsTable).values({
        id,
        userId: user.id,
        endpoint: `https://push.retention.test/${id}`,
        p256dh: 'key',
        auth: 'secret',
        lastSeenAt: lastSeenAt.toISOString(),
        createdAt: createdAt.toISOString(),
      });
      return id;
    };
    const period = retention.pushSubscriptionDaysUnseen;
    const subscriptions = {
      unseen: await subscription(outside(period), ago(period * 2)),
      seen: await subscription(inside(period), ago(period * 2)),
    };
    cases.push({
      rule: 'push subscriptions',
      remaining: async () =>
        (await db.select({ id: pushSubscriptionsTable.id }).from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, user.id))).map(
          (row) => row.id,
        ),
      kept: [subscriptions.seen],
      removed: [subscriptions.unseen],
    });

    await db.execute(sql`CALL apply_retention()`);
  });

  afterAll(async () => {
    await db.delete(rateLimitsTable).where(and(like(rateLimitsTable.key, 'retention-test:%')));
    await db.delete(oidcPayloadsTable).where(like(oidcPayloadsTable.id, 'retention-%'));
    await db.delete(requestsTable).where(like(requestsTable.email, '%@retention.test'));
    for (const cleanup of cleanups.reverse()) await cleanup();
    await clearDatabase();
  });

  it('keeps every row inside its period and removes every row past it', async () => {
    for (const { rule, remaining, kept, removed } of cases) {
      const ids = await remaining();
      expect(ids, rule).toEqual(expect.arrayContaining(kept));
      for (const id of removed) expect(ids, rule).not.toContain(id);
    }
  });
});

/**
 * The rule of an owned embedding (`appConfig.productEmbeddings`), which the template declares none of: the statement
 * the procedure runs for one, against a host table of this test. It soft-deletes files, so it is checked against rows.
 */
describe('apply_retention() collection of unreferenced owned rows', () => {
  const rule = {
    table: 'attachments',
    hosts: [
      { table: 'retention_test_hosts', column: 'files', isArray: true },
      { table: 'retention_test_hosts', column: 'cover_id', isArray: false },
    ],
  };
  const cleanups: (() => Promise<void>)[] = [];

  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) await cleanup();
    await clearDatabase();
  });

  it('soft-deletes a row past its period that no live host of its organization names, and keeps every other', async () => {
    const user = await createTestUser('retention-unreferenced@example.com');
    const organization = await createTestOrganization();
    const elsewhere = await createTestOrganization();
    const plan = await seedAttachmentHome({ id: organization.id, tenantId: organization.tenantId }, user.id);
    cleanups.push(() => cleanupEntityHierarchy(db, plan));

    const attachment = async (createdAt: Date, deletedAt: string | null = null) => {
      const id = generateId();
      const row = { id, tenantId: organization.tenantId, ...plan.channelIdColumns, keys: {}, createdBy: user.id, updatedBy: null };
      const stamps = { createdAt: createdAt.toISOString(), deletedAt, deletedBy: deletedAt ? user.id : null };
      await insertAttachmentRow(buildInsertableProduct('attachment', { ...row, ...stamps }, id));
      return id;
    };
    const old = outside(retention.unreferencedItemsDays);
    const deletedBefore = ago(3).toISOString();
    const rows = {
      named: await attachment(old),
      namedOnce: await attachment(old),
      young: await attachment(inside(retention.unreferencedItemsDays)),
      unnamed: await attachment(old),
      namedByDeletedHost: await attachment(old),
      namedElsewhere: await attachment(old),
      deletedByAPerson: await attachment(old, deletedBefore),
    };
    cleanups.push(async () => {
      await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, Object.values(rows)));
    });

    // A temporary table lives on one connection, which the transaction keeps.
    await db.transaction(async (tx) => {
      await tx.execute(sql`CREATE TEMP TABLE retention_test_hosts
        (organization_id uuid, deleted_at timestamptz, files uuid[], cover_id uuid) ON COMMIT DROP`);
      await tx.execute(sql`INSERT INTO retention_test_hosts (organization_id, deleted_at, files, cover_id) VALUES
        (${organization.id}, NULL, ARRAY[${rows.named}]::uuid[], ${rows.namedOnce}),
        (${organization.id}, now(), ARRAY[${rows.namedByDeletedHost}]::uuid[], NULL),
        (${elsewhere.id}, NULL, ARRAY[${rows.namedElsewhere}]::uuid[], NULL)`);
      await tx.execute(sql.raw(unreferencedBatchSql(rule)));
    });

    const stored = await db
      .select({ id: attachmentsTable.id, deletedAt: attachmentsTable.deletedAt, deletedBy: attachmentsTable.deletedBy, stx: attachmentsTable.stx })
      .from(attachmentsTable)
      .where(inArray(attachmentsTable.id, Object.values(rows)));
    // A tombstone a person made keeps its stamps: a run that moved them would put off its removal night after night.
    const earlier = stored.find((row) => row.id === rows.deletedByAPerson);
    expect(earlier).toMatchObject({ deletedBy: user.id });
    expect(Date.parse(earlier?.deletedAt ?? '')).toBe(Date.parse(deletedBefore));
    const collected = stored.filter((row) => row.deletedAt !== null && row.id !== rows.deletedByAPerson);

    expect(collected.map((row) => row.id).sort()).toEqual([rows.unnamed, rows.namedByDeletedHost, rows.namedElsewhere].sort());
    // Ids of its own: the tab of a row's last writer takes a delete with that writer's ids for an echo.
    for (const row of collected) expect(row.stx).toMatchObject({ sourceId: 'retention' });
  });
});
