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
import { unsafeInternalDb as db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { tenantsTable } from '#/db/schema/tenants';
import { usersTable } from '#/db/schema/users';
import type { ActivityEventWithEntity } from '#/sync/activity-bus';
import { activityBus } from '#/sync/activity-bus';
import { mockActivity } from '../../mocks/mock-activity';
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
      const mockEvent = mockActivity('test:emit-basic') as ActivityEventWithEntity;

      activityBus.on(mockEvent.type, handler);
      activityBus.emit(mockEvent);

      expect(handler).toHaveBeenCalledWith(mockEvent);

      activityBus.off(mockEvent.type, handler);
    });

    it('should support one-time event handlers', async () => {
      const handler = vi.fn();
      const mockEvent = mockActivity('test:once-handler') as ActivityEventWithEntity;

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
    expect(event.entityId).toBe(membershipData.id);
    expect(event.organizationId).toBe(testOrg.id);
  });
});
