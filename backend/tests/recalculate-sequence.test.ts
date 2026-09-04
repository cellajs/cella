import { sql } from 'drizzle-orm';
import { appConfig, type ChannelEntityType, hierarchy } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db, getSeedDb } from '#/db/db';
import { buildInsertableProduct } from '#/mocks';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { recalculateCounters } from '#/modules/entities/helpers/recalculate-counters';
import { getEntityTable } from '#/tables';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

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
    ANCESTORS.filter((type) => type !== 'organization' && !nullableAncestors.has(type)).map((type) => [
      type,
      crypto.randomUUID(),
    ]),
  );
  const homeChannelId = () => {
    const deepest = ANCESTORS.find((type) => type === 'organization' || !nullableAncestors.has(type));
    return !deepest || deepest === 'organization' ? tenant.organization.id : deeperAncestorIds[deepest];
  };
  const ancestorColumns = (orgId: string) =>
    Object.fromEntries(
      ANCESTORS.map((type) => [
        appConfig.entityIdColumnKeys[type],
        type === 'organization' ? orgId : (deeperAncestorIds[type] ?? null),
      ]),
    );

  beforeAll(async () => {
    mockFetchRequest();
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
        {
          tenantId: tenant.tenantId,
          ...ancestorColumns(tenant.organization.id),
          createdBy: null,
          updatedBy: null,
          deletedBy: null,
          seq,
          ...extra,
        },
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

  it('rebuilds sequence, subtree and self-family counters from row state', async () => {
    // Recalculation is an admin path (seed and CDC recovery): it reads every RLS table without tenant context.
    await recalculateCounters(seedDb);

    const readCounts = async (channelKey: string) => {
      const [counterRow] = await db
        .select({ counts: channelCountersTable.counts, path: channelCountersTable.path })
        .from(channelCountersTable)
        .where(sql`channel_key = ${channelKey}`);
      return counterRow;
    };

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
});
