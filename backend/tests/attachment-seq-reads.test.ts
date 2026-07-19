import { inArray } from 'drizzle-orm';
import { getAttachments } from 'sdk';
import { buildTestEntityHierarchyPlan, type TestEntityHierarchyPlan } from 'shared/testing/entity-hierarchy';
import { generateId } from 'shared/utils/entity-id';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { baseDb as db } from '#/db/db';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockStxBase } from '#/schemas/sync-transaction-mocks';
import { defaultHeaders } from './fixtures';
import { cleanupEntityHierarchy, seedEntityHierarchy } from './hierarchy-helpers';
import { clearSecurityTestData, createTestTenant, type TestTenant } from './security/helpers';
import { createAppClient } from './test-client';
import { mockFetchRequest, setTestConfig } from './test-utils';

setTestConfig({ enabledAuthStrategies: ['passkey'] });

const attachmentIds = {
  seq10: generateId(),
  seq20: generateId(),
  seq30Deleted: generateId(),
  seq40: generateId(),
  seq50: generateId(),
};

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

describe('Attachment seq reads', async () => {
  const call = await createAppClient();
  let tenant: TestTenant;
  // Ancestor context chain for attachment, derived from the app's real hierarchy: a fork with
  // organization → project → attachment seeds a project; an org-only fork seeds nothing.
  let plan: TestEntityHierarchyPlan;

  const listAttachments = async (query: Record<string, string | number>) => {
    const result = await call(getAttachments, {
      path: { organizationId: tenant.organization.id, tenantId: tenant.tenantId },
      query,
      headers: { ...defaultHeaders, Cookie: tenant.sessionCookie },
    });
    const data = result.data as { items: { id: string; seq: number; deletedAt: string | null }[] } | undefined;
    return { status: result.response.status, items: data?.items ?? [] };
  };

  beforeAll(async () => {
    mockFetchRequest();
    tenant = await createTestTenant(call, 'attachment-seq-reads');

    plan = buildTestEntityHierarchyPlan({
      entityType: 'attachment',
      rootChannelId: tenant.organization.id,
      makeChannelId: () => generateId(),
    });
    await seedEntityHierarchy(db, plan, {
      tenantId: tenant.tenantId,
      createdBy: tenant.user.id,
      slugPrefix: 'attachment-seq',
    });

    // Insert order is descending seq, so createdAt order disagrees with seq order.
    // B1 would pass accidentally if the endpoint sorted by createdAt.
    const baseAttachment = {
      tenantId: tenant.tenantId,
      ...plan.channelIdColumns,
      bucketName: 'attachments',
      contentType: 'image/png',
      size: '1000',
      stx: mockStxBase(),
      createdBy: tenant.user.id,
    };
    const rows = [
      {
        ...baseAttachment,
        id: attachmentIds.seq50,
        name: 'seq 50',
        filename: 'seq50.png',
        originalKey: 'k/50',
        seq: 50,
      },
      {
        ...baseAttachment,
        id: attachmentIds.seq40,
        name: 'seq 40',
        filename: 'seq40.png',
        originalKey: 'k/40',
        seq: 40,
      },
      {
        ...baseAttachment,
        id: attachmentIds.seq30Deleted,
        name: 'seq 30 tombstone',
        filename: 'seq30.png',
        originalKey: 'k/30',
        seq: 30,
        deletedAt: daysAgo(1),
      },
      {
        ...baseAttachment,
        id: attachmentIds.seq20,
        name: 'seq 20',
        filename: 'seq20.png',
        originalKey: 'k/20',
        seq: 20,
      },
      {
        ...baseAttachment,
        id: attachmentIds.seq10,
        name: 'seq 10',
        filename: 'seq10.png',
        originalKey: 'k/10',
        seq: 10,
      },
    ];
    for (const row of rows) {
      // Cast: `...plan.channelIdColumns` is a config-derived Record<string,string>, which widens
      // the row type; the runtime shape matches the attachment insert (organization/project ids).
      await db.insert(attachmentsTable).values(row as typeof attachmentsTable.$inferInsert);
    }
  });

  afterAll(async () => {
    await db.delete(attachmentsTable).where(inArray(attachmentsTable.id, Object.values(attachmentIds)));
    await cleanupEntityHierarchy(db, plan);
    await clearSecurityTestData();
  });

  it('B1: seqCursor reads are seq-ascending; a capped response is a clean prefix', async () => {
    // sort/order params must NOT override seq ordering on seq reads
    const result = await listAttachments({ seqCursor: '1,999999', limit: '2', sort: 'createdAt', order: 'desc' });

    expect(result.status).toBe(200);
    // Rows in seq order are 10, 20, 30 (tombstone), 40, 50. The capped response
    // must be exactly the two lowest seqs, nothing skipped below the cap.
    expect(result.items.map((a) => a.seq)).toEqual([10, 20]);
  });

  it('B2: seqCursor reads include tombstones; normal reads never do', async () => {
    // Delta read: tombstones flow through so client caches can drop soft-deleted rows
    const delta = await listAttachments({ seqCursor: '1,999999', limit: '100' });
    expect(delta.items.map((a) => a.seq)).toEqual([10, 20, 30, 40, 50]);
    const tombstone = delta.items.find((a) => a.seq === 30);
    expect(tombstone?.deletedAt).not.toBeNull();

    // Normal read: no tombstones
    const normal = await listAttachments({ limit: '100' });
    expect(normal.items.some((a) => a.id === attachmentIds.seq30Deleted)).toBe(false);
  });

  it('B3: limit above 1000 is rejected, not clamped', async () => {
    // Validation failures are malformed requests: 400 via the app's defaultHook, never 403
    const result = await listAttachments({ limit: '1001' });
    expect(result.status).toBe(400);
    expect(result.items).toEqual([]);
  });

  it('B4: bounded seqCursor respects both bounds (seq-filter OR-group regression)', async () => {
    const result = await listAttachments({ seqCursor: '20,40', limit: '100' });

    expect(result.status).toBe(200);
    // Before the fix, "20,40" joined the OR'd search group as (seq >= 20 OR seq <= 40) = all rows
    expect(result.items.map((a) => a.seq)).toEqual([20, 30, 40]);
  });
});
