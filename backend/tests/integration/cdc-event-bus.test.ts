/**
 * Integration tests for CDC → Activities → ActivityBus flow.
 *
 * These tests verify:
 * 1. ActivityBus can receive events locally
 * 2. Full flow: DB change → CDC Worker → WebSocket → ActivityBus
 *
 * Prerequisites:
 * - Real PostgreSQL with logical replication enabled
 * - For full CDC tests: CDC worker running with WebSocket connection
 */

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import type { ActivityEvent } from '#/lib/activity-bus';
import { activityBus } from '#/lib/activity-bus';
import { mockActivity } from '../../mocks/mock-activity';

/** Create a mock ActivityEvent from a mock activity. */
const mockEventWithData = (key: string): ActivityEvent =>
  ({
    ...mockActivity(key),
    rowData: {},
    cacheToken: null,
    seq: null,
    batchUntilSeq: null,
    deletedIds: null,
    propagation: null,
    trace: null,
  }) as ActivityEvent;

import { eq, sql } from 'drizzle-orm';
import { attachmentsTable } from '#/db/schema/attachments';
import { contextCountersTable } from '#/db/schema/context-counters';
import { mockAttachment } from '../../mocks/mock-attachment';
import { mockContextMembership } from '../../mocks/mock-membership';
import { mockOrganization } from '../../mocks/mock-organization';
import { mockUser } from '../../mocks/mock-user';
import { clearDatabase, ensureCdcSetup, waitForEvent } from './test-utils';

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
 * Full CDC flow tests.
 * These require the CDC worker to be running with WebSocket connection.
 * Skip in CI unless CDC is available.
 */
describe.skipIf(!process.env.CDC_WORKER_RUNNING)('Full CDC Flow', () => {
  let testOrg: { id: string; slug: string; tenantId: string };
  let testUser: { id: string; email: string };

  beforeAll(async () => {
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
    await clearDatabase();
  });

  it('should emit membership.created when membership is inserted', async () => {
    const eventPromise = waitForEvent('membership.created', 15000);

    // Use entity-agnostic mock that handles dynamic context entity columns
    const membershipData = mockContextMembership('organization', testOrg, testUser);
    await db.insert(membershipsTable).values(membershipData);

    // Wait for: INSERT → CDC → activities INSERT → trigger → NOTIFY → activityBus
    const event = await eventPromise;

    expect(event.type).toBe('membership.created');
    expect(event.subjectId).toBe(membershipData.id);
    expect(event.organizationId).toBe(testOrg.id);
  });

  it('should stamp attachments.seq and bump context_counters.s:attachment on UPDATE', async () => {
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
        .select({ s: sql<number>`(${contextCountersTable.counts}->>'s:attachment')::int` })
        .from(contextCountersTable)
        .where(eq(contextCountersTable.contextKey, counterKey));
      return row?.s ?? 0;
    };
    const readAttachment = async () => {
      const [row] = await db
        .select({ seq: attachmentsTable.seq, stx: attachmentsTable.stx })
        .from(attachmentsTable)
        .where(eq(attachmentsTable.id, attachment.id));
      return row;
    };

    const beforeCounter = await readCounter();

    // Backend-style UPDATE: bump summary AND set stx.changedFields so CDC processes it
    await db.execute(sql`
      UPDATE attachments
      SET name = 'cdc-seq-test-updated',
          stx = jsonb_set(stx, '{changedFields}', '["summary","updatedAt"]'::jsonb)
      WHERE id = ${attachment.id}
    `);

    // Poll for CDC to stamp the row (counter UPSERT + entity stamp)
    const deadline = Date.now() + 15000;
    let stamped: Awaited<ReturnType<typeof readAttachment>> | undefined;
    while (Date.now() < deadline) {
      stamped = await readAttachment();
      if (stamped && stamped.seq > 0) break;
      await new Promise((r) => setTimeout(r, 100));
    }

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
