/**
 * Integration tests for CDC → Activities → EventBus flow.
 *
 * These tests verify:
 * 1. EventBus can receive events via PostgreSQL NOTIFY
 * 2. Activity insertions trigger NOTIFY (via database trigger)
 * 3. Full flow: DB change → CDC → activities table → trigger → eventBus
 *
 * Prerequisites:
 * - Real PostgreSQL with logical replication enabled
 * - Migrations applied (creates trigger)
 * - For full CDC tests: CDC worker running
 */

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { db } from '#/db/db';
import { activitiesTable } from '#/db/schema/activities';
import { emailsTable } from '#/db/schema/emails';
import { membershipsTable } from '#/db/schema/memberships';
import { organizationsTable } from '#/db/schema/organizations';
import { usersTable } from '#/db/schema/users';
import type { ActivityEvent } from '#/lib/event-bus';
import { eventBus } from '#/lib/event-bus';
import { nanoid } from '#/utils/nanoid';
import { mockOrganization } from '../../mocks/mock-organization';
import { mockUser } from '../../mocks/mock-user';
import { clearDatabase, ensureCdcSetup, startEventBus, stopEventBus, waitForEvent } from './test-utils';

describe('EventBus Integration', () => {
  beforeAll(async () => {
    // Migrations are handled by global-setup.ts
    await clearDatabase();
    await startEventBus();
  });

  afterAll(async () => {
    await stopEventBus();
  });

  describe('EventBus basics', () => {
    it('should receive locally emitted events', async () => {
      const handler = vi.fn();
      eventBus.on('user.created', handler);

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
      };

      await eventBus.emit('user.created', mockEvent);

      expect(handler).toHaveBeenCalledWith(mockEvent);

      eventBus.off('user.created', handler);
    });

    it('should support one-time event handlers', async () => {
      const handler = vi.fn();
      eventBus.once('organization.updated', handler);

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
      };

      await eventBus.emit('organization.updated', mockEvent);
      await eventBus.emit('organization.updated', mockEvent);

      // Should only be called once
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  // Skip CDC-dependent tests when not in full test mode
  describe.skipIf(process.env.TEST_MODE !== 'full')('Activity trigger → EventBus', () => {
    it('should receive event when activity is inserted directly', async () => {
      // This tests the PostgreSQL trigger path
      const eventPromise = waitForEvent<ActivityEvent>('membership.created', 5000);

      const entityId = nanoid();
      const userId = nanoid();
      const organizationId = nanoid();

      // Create a valid user first to satisfy foreign key constraint
      const userData = mockUser();
      userData.id = userId;
      await db.insert(usersTable).values(userData);
      await db.insert(emailsTable).values({
        email: userData.email,
        userId: userData.id,
        verified: true,
      });

      // Create a valid organization to satisfy foreign key constraint
      const orgData = mockOrganization();
      orgData.id = organizationId;
      await db.insert(organizationsTable).values(orgData);

      // Insert activity directly (simulating what CDC does)
      // Note: membership is a resourceType, not entityType
      await db.insert(activitiesTable).values({
        id: nanoid(),
        type: 'membership.created',
        action: 'create',
        tableName: 'memberships',
        entityType: null,
        resourceType: 'membership',
        entityId,
        userId,
        organizationId,
        changedKeys: ['userId', 'role'],
      });

      // Wait for the trigger to fire NOTIFY → eventBus receives
      const event = await eventPromise;

      expect(event.type).toBe('membership.created');
      expect(event.entityId).toBe(entityId);
      expect(event.userId).toBe(userId);
    });

    it('should handle multiple activities in sequence', async () => {
      const events: ActivityEvent[] = [];
      const handler = (event: ActivityEvent) => {
        events.push(event);
      };

      eventBus.on('user.updated', handler);

      const userId = nanoid();

      // Create a valid user first to satisfy foreign key constraint
      const userData = mockUser();
      userData.id = userId;
      await db.insert(usersTable).values(userData);
      await db.insert(emailsTable).values({
        email: userData.email,
        userId: userData.id,
        verified: true,
      });

      // Insert multiple activities
      for (let i = 0; i < 3; i++) {
        await db.insert(activitiesTable).values({
          id: nanoid(),
          type: 'user.updated',
          action: 'update',
          tableName: 'users',
          entityType: 'user',
          resourceType: null,
          entityId: userId,
          userId,
          organizationId: null,
          changedKeys: ['name'],
        });
      }

      // Give some time for all events to propagate
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(events.length).toBe(3);
      events.forEach((event) => {
        expect(event.entityId).toBe(userId);
      });

      eventBus.off('user.updated', handler);
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

  it('should have activity notify trigger installed', async () => {
    const result = await db.execute<{ trigger_name: string }>(
      sql`SELECT trigger_name FROM information_schema.triggers 
          WHERE event_object_table = 'activities' 
          AND trigger_name = 'activities_notify_trigger'`,
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].trigger_name).toBe('activities_notify_trigger');
  });
});

/**
 * Full CDC flow tests.
 * These require the CDC worker to be running.
 * Skip in CI unless CDC is available.
 */
describe.skipIf(!process.env.CDC_WORKER_RUNNING)('Full CDC Flow', () => {
  let testOrg: { id: string; slug: string };
  let testUser: { id: string; email: string };

  beforeAll(async () => {
    await clearDatabase();
    await startEventBus();

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
    await stopEventBus();
  });

  it('should emit membership.created when membership is inserted', async () => {
    const eventPromise = waitForEvent<ActivityEvent>('membership.created', 15000);

    // Insert membership (CDC will pick this up and create activity)
    const membershipId = nanoid();
    await db.insert(membershipsTable).values({
      id: membershipId,
      userId: testUser.id,
      organizationId: testOrg.id,
      contextType: 'organization',
      role: 'member',
      order: 1,
      createdBy: testUser.id,
      uniqueKey: `${testUser.id}-${testOrg.id}`,
    });

    // Wait for: INSERT → CDC → activities INSERT → trigger → NOTIFY → eventBus
    const event = await eventPromise;

    expect(event.type).toBe('membership.created');
    expect(event.entityId).toBe(membershipId);
    expect(event.organizationId).toBe(testOrg.id);
  });
});
