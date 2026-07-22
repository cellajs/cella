import { sql } from 'drizzle-orm';
import { appConfig, hierarchy } from 'shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db, seedDb } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { recalculateCounters } from '#/modules/entities/helpers/recalculate-counters';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

/**
 * Counter recalculation (the drift/incident repair tool; its output IS the contract) must
 * agree with CDC's incremental sequence writes: `sequence` = max stamped seq across the
 * org's product tables, `e:f:{type}` = max seq per (node, type), `e:c:{type}` = live published.
 */
describe('recalculateCounters (sequence + frontier)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;

  // The seeded product's home node (where the self family e:f:h:/e:c:h: rolls up) is the
  // deepest ancestor, derived from config: the organization when the product is org-homed (base
  // Cella), or a deeper channel such as a shared project when a fork homes it lower. Ids for
  // ancestors below the organization are generated; all three rows share them so the self
  // counters land at a single, assertable node.
  const PRODUCT = 'attachment';
  const ANCESTORS = hierarchy.getOrderedAncestors(PRODUCT); // deepest → root
  const deeperAncestorIds = Object.fromEntries(
    ANCESTORS.filter((type) => type !== 'organization').map((type) => [type, crypto.randomUUID()]),
  );
  const homeChannelId = () => {
    const deepest = ANCESTORS[0];
    return deepest === 'organization' ? tenant.organization.id : deeperAncestorIds[deepest];
  };
  const ancestorColumns = (orgId: string) =>
    Object.fromEntries(
      ANCESTORS.map((type) => [
        appConfig.entityIdColumnKeys[type],
        type === 'organization' ? orgId : deeperAncestorIds[type],
      ]),
    );

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'recalc-sequence');

    const base = (key: string, seq: number, extra: Record<string, unknown> = {}) => {
      // Strip generated/select-only fields; bind to the test tenant and the product's ancestor
      // columns; audit users nulled (mock ids have no users rows and the columns are nullable FKs).
      const { path: _path, ...row } = mockAttachment(key) as unknown as Record<string, unknown>;
      return {
        ...row,
        tenantId: tenant.tenantId,
        ...ancestorColumns(tenant.organization.id),
        createdBy: null,
        updatedBy: null,
        deletedBy: null,
        seq,
        ...extra,
      };
    };

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
    await recalculateCounters(db);

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

    // Self family lands at the home node (deepest ancestor): the org itself when org-homed, or a
    // deeper channel otherwise. When home == org these keys sit on the same org row read above.
    const homeCounts = (await readCounts(homeChannelId())).counts as Record<string, number>;
    expect(homeCounts[`e:f:h:${PRODUCT}`]).toBe(47);
    expect(homeCounts[`e:c:h:${PRODUCT}`]).toBe(2);
  });
});
