import { and, eq } from 'drizzle-orm';
import { deleteMemberships } from 'sdk';
import { generateId } from 'shared/utils/entity-id';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { baseDb as db } from '#/db/db';
import { activityBus } from '#/lib/activity-bus';
import { maxPendingStreamBytes } from '#/modules/entities/stream/helpers';
import { membershipsTable } from '#/modules/memberships/memberships-db';
import { adminRole, defaultHeaders } from '../fixtures';
import { createTestOrganization } from '../helpers';
import { createAppClient } from '../test-client';
import { clearSecurityTestData, createOrgUser } from './helpers';
import { cancelOpenStreams, expectClosedWith, expectReleased, insertSession, openStream, openUnreadStream, readStream } from './session-helpers';

const gate = vi.hoisted(() => ({ held: null as Promise<void> | null, entered: 0 }));

// Holds a connect between its guard and its registration, where a membership event reaches no subscriber of it.
vi.mock('#/modules/entities/operations/app-catchup', async (importOriginal) => {
  const original = await importOriginal<typeof import('#/modules/entities/operations/app-catchup')>();
  return {
    ...original,
    getLatestActivityId: async (...args: Parameters<typeof original.getLatestActivityId>) => {
      gate.entered++;
      await gate.held;
      return original.getLatestActivityId(...args);
    },
  };
});

afterEach(async () => {
  await cancelOpenStreams();
  await clearSecurityTestData();
});

/** A deleted attachment of the organization, as the CDC worker delivers it: one frame per reader, no notification. */
const emitAttachmentDeleted = (org: { id: string; tenantId: string }, authorId: string) => {
  const id = generateId();
  activityBus.emit({
    id: generateId(),
    type: 'attachment.deleted',
    action: 'delete',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    subjectId: id,
    tenantId: org.tenantId,
    organizationId: org.id,
    rowData: null,
    rows: [{ rowData: { id, organizationId: org.id, tenantId: org.tenantId, createdBy: authorId } }],
    trace: null,
    stx: null,
  } as never);
};

const changesOf = (stream: { events: { event: string }[] }) => stream.events.filter((e) => e.event === 'change');

/**
 * A stream holds what its client may read while the client reads it. A client that stops reading, or a connect that
 * crosses its user's removal, must not keep the server's memory or the organization's frames.
 */
describe('The app stream lets go of what its client cannot hold', async () => {
  const call = await createAppClient();

  it('must not let a stalled stream hold more than the pending-bytes ceiling', async () => {
    const org = await createTestOrganization();
    const [stalled, reader] = [await createOrgUser(call, org.tenantId, org.id, 'stalled'), await createOrgUser(call, org.tenantId, org.id, 'reader')];
    const stalledStream = await openUnreadStream(stalled.id, await insertSession(stalled));
    const readerStream = await openStream(reader.id, await insertSession(reader));

    // Twice the ceiling in frames of at least 200 bytes, a few to a tick, as CDC messages arrive.
    const changes = Math.ceil((2 * maxPendingStreamBytes) / 200);
    for (let i = 1; i <= changes; i++) {
      emitAttachmentDeleted(org, reader.id);
      if (i % 10 === 0) await new Promise(setImmediate);
    }

    await expectReleased(stalled.id, stalledStream);
    await vi.waitFor(() => expect(changesOf(readerStream).length).toBe(changes));
  });

  it("must not keep a removed member's stream that connected across the removal", async () => {
    const org = await createTestOrganization();
    const admin = await createOrgUser(call, org.tenantId, org.id, 'race-admin', adminRole);
    const removed = await createOrgUser(call, org.tenantId, org.id, 'race-removed');
    const adminStream = await openStream(admin.id, await insertSession(admin));

    // The member's connect passes its guard with the membership, then holds before it registers.
    let release = () => {};
    gate.held = new Promise((resolve) => {
      release = resolve;
    });
    const entered = gate.entered;
    const removedSession = await insertSession(removed);
    const { baseApp } = await import('#/routes');
    const connecting = baseApp.request('http://localhost/entities/app/stream', { headers: removedSession.headers });
    await vi.waitFor(() => expect(gate.entered).toBe(entered + 1));

    // The admin removes the member, and CDC delivers the delete while the connect holds.
    const [membership] = await db
      .select()
      .from(membershipsTable)
      .where(and(eq(membershipsTable.userId, removed.id), eq(membershipsTable.organizationId, org.id)));
    const deleted = await call(deleteMemberships, {
      path: { tenantId: org.tenantId, organizationId: org.id },
      query: { entityId: org.id, entityType: 'organization' },
      body: { ids: [removed.id] },
      headers: { ...defaultHeaders, Cookie: admin.sessionCookie },
    });
    expect(deleted.response.status).toBe(200);
    activityBus.emit({
      id: generateId(),
      type: 'membership.deleted',
      action: 'delete',
      resourceType: 'membership',
      entityType: null,
      tableName: 'memberships',
      subjectId: membership.id,
      tenantId: org.tenantId,
      organizationId: org.id,
      rowData: membership,
      rows: null,
      trace: null,
      stx: null,
    } as never);

    gate.held = null;
    release();
    const response = await connecting;
    expect(response.status).toBe(200);
    const removedStream = readStream(response, removedSession.id);
    await expectClosedWith(removedStream, 'access_changed');

    // The organization's next change reaches its admin only.
    emitAttachmentDeleted(org, admin.id);
    await vi.waitFor(() => expect(changesOf(adminStream).length).toBe(1));
    expect(changesOf(removedStream)).toEqual([]);
  });
});
