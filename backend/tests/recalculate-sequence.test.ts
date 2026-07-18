import { sql } from 'drizzle-orm';
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
 * Counter recalculation must agree with CDC's incremental sequence writes:
 * `sequence` = max stamped seq across all product tables in the org, `f:{type}` =
 * max seq per (node, type), `e:{type}` = live published rows. This is the repair
 * tool for drift/incident recovery; its output IS the contract.
 */
describe('recalculateCounters (sequence + frontier)', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'recalc-sequence');

    const base = (key: string, seq: number, extra: Record<string, unknown> = {}) => {
      // Strip generated/select-only fields; bind to the test tenant/org; audit users
      // nulled (mock ids have no users rows and the columns are nullable FKs).
      const { path: _path, ...row } = mockAttachment(key) as unknown as Record<string, unknown>;
      return {
        ...row,
        tenantId: tenant.tenantId,
        organizationId: tenant.organization.id,
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
    await clearSecurityTestData();
  });

  it('rebuilds sequence, f:attachment and e:attachment from row state', async () => {
    await recalculateCounters(db);

    const [row] = await db
      .select({ counts: channelCountersTable.counts, path: channelCountersTable.path })
      .from(channelCountersTable)
      .where(sql`channel_key = ${tenant.organization.id}`);

    const counts = row.counts as Record<string, number>;
    // Path backfill: the org channel's canonical path is its own id.
    expect(row.path).toBe(tenant.organization.id);
    // Sequence reservation counter: max stamped value across product tables.
    expect(counts.sequence).toBe(47);
    // Frontier includes tombstones (they keep their seq for delta reads).
    expect(counts['f:attachment']).toBe(47);
    // Live count excludes the soft-deleted row.
    expect(counts['e:attachment']).toBe(2);
    // Self family (attachments are org-homed, so self == subtree at the org node).
    expect(counts['fs:attachment']).toBe(47);
    expect(counts['es:attachment']).toBe(2);
  });
});
