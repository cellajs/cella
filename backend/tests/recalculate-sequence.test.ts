import { sql } from 'drizzle-orm';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db, getSeedDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { computeChannelCounters, recalculateCounters } from '#/modules/entities/counters-queries';
import { getEntityTable } from '#/tables';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { setTestConfig } from './test-utils';

const seedDb = getSeedDb();

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * Recalculation must agree with CDC's incremental writes: `sequence` = max stamped seq across
 * the org's product tables, `e:f:{type}` = max seq per (node, type), `e:c:{type}` = live published.
 */
describe('recalculateCounters (sequence + frontier)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;

  // Shared ancestor ids make all rows roll into one assertable self-counter node.
  const PRODUCT = 'attachment';
  const ANCESTORS = hierarchy.getOrderedAncestors(PRODUCT); // deepest → root
  // Nullable ancestors stay null (their FKs would reject invented ids), so rows home at the
  // deepest strict ancestor; invented ids remain only for strict deeper ancestors.
  const nullableAncestors = new Set<string>(hierarchy.getNullableAncestors(PRODUCT));
  const deeperAncestorIds = Object.fromEntries(
    ANCESTORS.filter((type) => type !== 'organization' && !nullableAncestors.has(type)).map((type) => [type, crypto.randomUUID()]),
  );
  const homeChannelId = () => {
    const deepest = ANCESTORS.find((type) => type === 'organization' || !nullableAncestors.has(type));
    return !deepest || deepest === 'organization' ? tenant.organization.id : deeperAncestorIds[deepest];
  };
  const ancestorColumns = (orgId: string) =>
    Object.fromEntries(
      ANCESTORS.map((type) => [appConfig.entityIdColumnKeys[type], type === 'organization' ? orgId : (deeperAncestorIds[type] ?? null)]),
    );

  beforeAll(async () => {
    tenant = await createTestTenant(call, 'recalc-sequence');

    // Relation columns reference strict deeper ancestors, so their rows must exist: one minimal
    // channel row per strict deeper ancestor, root-first, under the test organization (none in cella).
    for (const type of [...ANCESTORS].reverse().filter((type) => type in deeperAncestorIds)) {
      const ownAncestors = Object.fromEntries(
        hierarchy
          .getOrderedAncestors(type as ChannelEntityType)
          .map((ancestor) => [
            appConfig.entityIdColumnKeys[ancestor],
            ancestor === 'organization' ? tenant.organization.id : (deeperAncestorIds[ancestor] ?? null),
          ]),
      );
      await seedDb.insert(getEntityTable(type as ChannelEntityType)).values({
        id: deeperAncestorIds[type],
        tenantId: tenant.tenantId,
        ...ownAncestors,
        name: `recalc ${type}`,
        slug: `recalc-${type}-${deeperAncestorIds[type].slice(0, 8)}`,
        createdBy: tenant.user.id,
      } as never);
    }

    const base = (key: string, seq: number, extra: Record<string, unknown> = {}) =>
      // Audit users are nulled: mock ids have no users rows and the columns are nullable FKs.
      buildInsertableProduct(
        PRODUCT,
        { tenantId: tenant.tenantId, ...ancestorColumns(tenant.organization.id), createdBy: null, updatedBy: null, deletedBy: null, seq, ...extra },
        key,
      );

    await seedDb.insert(attachmentsTable).values([
      base('recalc:a1', 41) as never,
      base('recalc:a2', 44) as never,
      // Tombstone keeps its seq: counts exclude it, frontier includes it.
      base('recalc:a3', 47, { deletedAt: '2026-07-10T00:00:00.000Z' }) as never,
    ]);
  });

  afterAll(async () => {
    await seedDb.execute(sql`DELETE FROM attachments WHERE organization_id = ${tenant.organization.id}`);
    await seedDb.execute(sql`DELETE FROM channel_counters WHERE channel_key = ${tenant.organization.id}`);
    const home = homeChannelId();
    if (home !== tenant.organization.id) {
      await seedDb.execute(sql`DELETE FROM channel_counters WHERE channel_key = ${home}`);
    }
    await clearSecurityTestData();
  });

  const readCounts = async (channelKey: string) => {
    const [counterRow] = await db
      .select({ counts: channelCountersTable.counts, path: channelCountersTable.path })
      .from(channelCountersTable)
      .where(sql`channel_key = ${channelKey}`);
    return counterRow;
  };

  it('rebuilds sequence, subtree and self-family counters from row state', async () => {
    // Recalculation is an admin path (seed and CDC recovery): it reads every RLS table without tenant context.
    await recalculateCounters({ var: { db: seedDb } });

    const orgRow = await readCounts(tenant.organization.id);
    const orgCounts = orgRow.counts as Record<string, number>;
    // Path backfill: the org channel's canonical path is its own id.
    expect(orgRow.path).toBe(tenant.organization.id);
    // Sequence reservation counter: max stamped value across product tables.
    expect(orgCounts.sequence).toBe(47);
    // Subtree frontier includes tombstones (they keep their seq for delta reads).
    expect(orgCounts[`e:f:${PRODUCT}`]).toBe(47);
    // Subtree live count excludes the soft-deleted row.
    expect(orgCounts[`e:c:${PRODUCT}`]).toBe(2);

    // Self-family keys land at the home node, the deepest ancestor.
    const homeCounts = (await readCounts(homeChannelId())).counts as Record<string, number>;
    expect(homeCounts[`e:f:h:${PRODUCT}`]).toBe(47);
    expect(homeCounts[`e:c:h:${PRODUCT}`]).toBe(2);
  });

  it('counts the same without writing, for the worker to compare with', async () => {
    await recalculateCounters({ var: { db: seedDb } });
    const [stored] = await db
      .select({ counts: channelCountersTable.counts })
      .from(channelCountersTable)
      .where(sql`channel_key = ${tenant.organization.id}`);

    const counted = (await computeChannelCounters({ var: { db: seedDb } })).get(tenant.organization.id);

    // One SQL body for both: every key the count yields is the key the rebuild stored.
    expect(counted).toBeDefined();
    for (const [key, value] of Object.entries(counted ?? {})) expect((stored.counts as Record<string, number>)[key], key).toBe(value);
    expect(counted?.sequence).toBe(47);
  });

  it('must not set the sequence counter or a frontier back via a rebuild that counts less than is stored', async () => {
    // The worker has handed out values up to 60 that the table rows do not show: in flight, or held by rows deleted since.
    await seedDb.execute(sql`
      UPDATE channel_counters SET counts = counts || ${JSON.stringify({ sequence: 60, [`e:f:${PRODUCT}`]: 60, [`e:c:${PRODUCT}`]: 9 })}::jsonb
      WHERE channel_key = ${tenant.organization.id}
    `);

    await recalculateCounters({ var: { db: seedDb } });

    const [row] = await db
      .select({ counts: channelCountersTable.counts })
      .from(channelCountersTable)
      .where(sql`channel_key = ${tenant.organization.id}`);
    const counts = row.counts as Record<string, number>;
    expect(counts.sequence).toBe(60);
    expect(counts[`e:f:${PRODUCT}`]).toBe(60);
    // Positive control: a plain count is replaced by what the tables hold.
    expect(counts[`e:c:${PRODUCT}`]).toBe(2);
  });

  it('must not leave the count of a home standing whose rows are all gone, nor take back a sequence value or a frontier', async () => {
    await recalculateCounters({ var: { db: seedDb } });
    const orgBefore = (await readCounts(tenant.organization.id)).counts;
    const homeBefore = (await readCounts(homeChannelId())).counts;
    expect(homeBefore[`e:c:h:${PRODUCT}`]).toBe(2);
    expect(orgBefore.sequence).toBeGreaterThanOrEqual(47);

    // Every row of the home goes: the recount has no row to count for it any more, and yields nothing for its home count.
    await seedDb.execute(sql`DELETE FROM attachments WHERE organization_id = ${tenant.organization.id}`);
    await recalculateCounters({ var: { db: seedDb } });

    const org = (await readCounts(tenant.organization.id)).counts;
    const home = (await readCounts(homeChannelId())).counts;
    expect(home[`e:c:h:${PRODUCT}`]).toBe(0);
    expect(org[`e:c:${PRODUCT}`]).toBe(0);
    // The values that were handed out stay handed out: a client holds them as its cursor.
    expect(org.sequence).toBe(orgBefore.sequence);
    expect(org[`e:f:${PRODUCT}`]).toBe(orgBefore[`e:f:${PRODUCT}`]);
    expect(home[`e:f:h:${PRODUCT}`]).toBe(homeBefore[`e:f:h:${PRODUCT}`]);
  });
});
