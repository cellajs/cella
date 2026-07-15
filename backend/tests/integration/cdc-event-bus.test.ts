import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import type { ActivityEvent } from '#/lib/activity-bus';
import { activityBus } from '#/lib/activity-bus';
import { mockActivity } from '#/modules/activities/activities-mocks';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { organizationsTable } from '#/modules/organization/organization-db';
import { tenantsTable } from '#/modules/tenants/tenants-db';
import { emailsTable } from '#/modules/user/emails-db';
import { usersTable } from '#/modules/user/user-db';

/** Create a mock ActivityEvent from a mock activity. */
const mockEventWithData = (key: string): ActivityEvent =>
  ({
    ...mockActivity(key),
    rowData: {},
    cacheToken: null,
    seq: null,
    batchUntilSeq: null,
    propagation: null,
    trace: null,
  }) as ActivityEvent;

import { eq, sql } from 'drizzle-orm';
import { attachmentsTable } from '#/modules/attachment/attachment-db';
import { mockAttachment } from '#/modules/attachment/attachment-mocks';
import { channelCountersTable } from '#/modules/entities/channel-counters-db';
import { mockChannelMembership } from '#/modules/memberships/memberships-mocks';
import { mockOrganization } from '#/modules/organization/organization-mocks';
import { mockUser } from '#/modules/user/user-mocks';
import { clearDatabase, ensureCdcSetup, startInProcessCdcWorker, waitFor, waitForEvent } from './test-utils';

// Covers local ActivityBus events and full DB change to CDC worker to WebSocket
// to ActivityBus delivery.
describe('EventBus Integration', () => {
  beforeAll(async () => {
    // Migrations are handled by global-setup.ts
    await clearDatabase();
  });

  describe('EventBus basics', () => {
    it('should receive locally emitted events', async () => {
      const handler = vi.fn();
      // Use mockActivity for entity-agnostic event generation
      const mockEvent = mockEventWithData('test:emit-basic');

      activityBus.on(mockEvent.type, handler);
      activityBus.emit(mockEvent);

      expect(handler).toHaveBeenCalledWith(mockEvent);

      activityBus.off(mockEvent.type, handler);
    });

    it('should support one-time event handlers', async () => {
      const handler = vi.fn();
      const mockEvent = mockEventWithData('test:once-handler');

      activityBus.once(mockEvent.type, handler);

      activityBus.emit(mockEvent);
      activityBus.emit(mockEvent);

      // Should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});

// Skip CDC setup verification when not in full test mode
describe.skipIf(process.env.TEST_MODE !== 'full')('CDC Setup Verification', () => {
  // Migrations are handled by global-setup.ts

  it('should have CDC publication configured', async () => {
    const { publicationExists } = await ensureCdcSetup();
    expect(publicationExists).toBe(true);
  });
});

/**
 * Starts the CDC worker pipeline in-process so the suite runs in `pnpm test`
 * without depending on a separately running worker.
 */
describe.skipIf(process.env.TEST_MODE !== 'full')('Full CDC Flow', () => {
  let cdcHarness: Awaited<ReturnType<typeof startInProcessCdcWorker>>;
  let testOrg: { id: string; slug: string; tenantId: string };
  let testUser: { id: string; email: string };

  beforeAll(async () => {
    cdcHarness = await startInProcessCdcWorker();
    await clearDatabase();

    // Create tenant first (orgs require tenant FK)
    const [tenant] = await db.insert(tenantsTable).values({ name: 'Test Tenant' }).returning({ id: tenantsTable.id });

    // Create test organization with tenant reference
    const orgData = mockOrganization();
    [testOrg] = await db
      .insert(organizationsTable)
      .values({ ...orgData, tenantId: tenant.id })
      .returning({ id: organizationsTable.id, slug: organizationsTable.slug, tenantId: organizationsTable.tenantId });

    // Create test user
    const userData = mockUser();
    [testUser] = await db.insert(usersTable).values(userData).returning({ id: usersTable.id, email: usersTable.email });
    await db.insert(emailsTable).values({ email: testUser.email, userId: testUser.id, verified: true });
  });

  afterAll(async () => {
    await cdcHarness?.stop();
    await clearDatabase();
  });

  it('should emit membership.created when membership is inserted', async () => {
    const eventPromise = waitForEvent('membership.created', 15000);

    // Use entity-agnostic mock that handles dynamic channel entity columns
    const membershipData = mockChannelMembership('organization', testOrg, testUser);
    await db.insert(membershipsTable).values(membershipData);

    // Wait for: INSERT → CDC → activities INSERT → trigger → NOTIFY → activityBus
    const event = await eventPromise;

    expect(event.type).toBe('membership.created');
    expect(event.resourceType).toBe('membership');
    expect(event.subjectId).toBe(membershipData.id);
    expect(event.rowData).toMatchObject({
      channelType: 'organization',
      channelId: testOrg.id,
      organizationId: testOrg.id,
    });
  });

  it('should stamp attachments.seq and bump channel_counters.s:attachment on UPDATE', async () => {
    const attachment = {
      ...mockAttachment('cdc-seq-test-attachment'),
      tenantId: testOrg.tenantId,
      organizationId: testOrg.id,
      createdBy: testUser.id,
      updatedBy: testUser.id,
      seq: 0,
    };
    await db.insert(attachmentsTable).values(attachment);

    const counterKey = sql`${testOrg.id}::varchar`;
    const readCounter = async () => {
      const [row] = await db
        .select({ s: sql<number>`(${channelCountersTable.counts}->>'s:attachment')::int` })
        .from(channelCountersTable)
        .where(eq(channelCountersTable.channelKey, counterKey));
      return row?.s ?? 0;
    };
    const readAttachment = async () => {
      const [row] = await db
        .select({ seq: attachmentsTable.seq, stx: attachmentsTable.stx })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.id, attachment.id));
      return row;
    };

    let inserted: Awaited<ReturnType<typeof readAttachment>> | undefined;
    await waitFor(
      async () => {
        inserted = await readAttachment();
        const counter = await readCounter();
        return !!inserted && inserted.seq > 0 && counter > 0;
      },
      15_000,
      'CDC insert stamp on attachment',
    );

    const beforeCounter = await readCounter();
    const beforeSeq = inserted!.seq;

    // Backend-style UPDATE: bump summary AND set stx.changedFields so CDC processes it
    await db.execute(sql`
      UPDATE attachments
      SET name = 'cdc-seq-test-updated',
          stx = jsonb_set(stx, '{changedFields}', '["summary","updatedAt"]'::jsonb)
      WHERE id = ${attachment.id}
    `);

    // Poll for CDC to stamp the row (counter UPSERT + entity stamp)
    let stamped: Awaited<ReturnType<typeof readAttachment>> | undefined;
    await waitFor(
      async () => {
        stamped = await readAttachment();
        return !!stamped && stamped.seq > beforeSeq;
      },
      15_000,
      'CDC seq stamp on attachment update',
    );

    expect(stamped, 'attachment row should exist').toBeDefined();
    expect(stamped!.seq, 'seq should be stamped by CDC').toBeGreaterThan(0);

    const afterCounter = await readCounter();
    expect(afterCounter, 'organization s:attachment should advance').toBe(beforeCounter + 1);
    expect(stamped!.seq, 'attachment.seq should equal new s:attachment').toBe(afterCounter);

    // changedFields should be stripped from stx as part of the stamp
    const stx = stamped!.stx as { changedFields?: unknown } | null;
    expect(stx?.changedFields, 'stx.changedFields should be removed').toBeUndefined();
  });
});
