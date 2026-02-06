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
import { db } from '#/db/db';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import type { ActivityEvent } from '#/sync/activity-bus';
import { activityBus } from '#/sync/activity-bus';
import { nanoid } from '#/utils/nanoid';
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
      activityBus.on('user.created', handler);

      const mockEvent: ActivityEvent = {
        id: nanoid(),
        type: 'user.created',
        action: 'create',
        tableName: 'users',
        entityType: 'user',
        resourceType: null,
        entityId: nanoid(),
        userId: nanoid(),
        organizationId: null,
        changedKeys: ['email', 'name'],
        createdAt: new Date().toISOString(),
        tx: null,
        seq: null,
        error: null,
      };

      activityBus.emit(mockEvent);

      expect(handler).toHaveBeenCalledWith(mockEvent);

      activityBus.off('user.created', handler);
    });

    it('should support one-time event handlers', async () => {
      const handler = vi.fn();
      activityBus.once('organization.updated', handler);

      const mockEvent: ActivityEvent = {
        id: nanoid(),
        type: 'organization.updated',
        action: 'update',
        tableName: 'organizations',
        entityType: 'organization',
        resourceType: null,
        entityId: nanoid(),
        userId: nanoid(),
        organizationId: nanoid(),
        changedKeys: ['name'],
        createdAt: new Date().toISOString(),
        tx: null,
        seq: null,
        error: null,
      };

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
  let testOrg: { id: string; slug: string };
  let testUser: { id: string; email: string };

  beforeAll(async () => {
    await clearDatabase();

    // Create test organization
    const orgData = mockOrganization();
    [testOrg] = await db
      .insert(organizationsTable)
      .values(orgData)
      .returning({ id: organizationsTable.id, slug: organizationsTable.slug });

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

    // Insert membership (CDC will pick this up and create activity)
    const membershipId = nanoid();
    await db.insert(membershipsTable).values({
      id: membershipId,
      userId: testUser.id,
      organizationId: testOrg.id,
      contextType: 'organization',
      role: 'member',
      displayOrder: 1,
      createdBy: testUser.id,
      uniqueKey: `${testUser.id}-${testOrg.id}`,
    });

    // Wait for: INSERT → CDC → activities INSERT → trigger → NOTIFY → activityBus
    const event = await eventPromise;

    expect(event.type).toBe('membership.created');
    expect(event.entityId).toBe(membershipId);
    expect(event.organizationId).toBe(testOrg.id);
  });
});
