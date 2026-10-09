import type { SSEStreamingApi } from 'hono/streaming';
import type { EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import { type ActivityEvent, activityBus } from '#/lib/activity-bus';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { memberRole } from '../../../tests/fixtures';
import { streamSubscriberManager } from './stream';
import './entities-listeners';

const ORG = 'org-listeners';

const membership = (role: EntityRole, userId: string): MembershipBaseModel =>
  ({ id: `mem-${ORG}-${userId}`, userId, channelType: 'organization', channelId: ORG, organizationId: ORG, role }) as unknown as MembershipBaseModel;

/** A subscriber whose stream records what it was sent and whether it was closed. */
const fakeSubscriber = (userId: string) => {
  const sent: { event?: string; data: string }[] = [];
  let closed = false;
  const stream = {
    writeSSE: async (message: { event?: string; data: string }) => {
      sent.push(message);
    },
    abort: () => {},
    close: async () => {
      closed = true;
    },
  } as unknown as SSEStreamingApi;
  const subscriber: AppStreamSubscriber = {
    id: crypto.randomUUID(),
    channel: `org:${ORG}`,
    stream,
    userId,
    sessionId: `session-${userId}`,
    organizationIds: new Set([ORG]),
    isSystemAdmin: false,
    systemAccessAllowed: false,
    memberships: [membership(memberRole, userId)],
    cursor: null,
  };
  streamSubscriberManager.register(subscriber, [`user:${userId}`]);
  return { subscriber, sent, isClosed: () => closed };
};

/** A membership event as the CDC worker sends it: one row, with the organization its row holds. */
const membershipEvent = (action: 'create' | 'delete', userId: string): ActivityEvent =>
  ({
    id: `activity-${action}-${userId}`,
    type: action === 'create' ? 'membership.created' : 'membership.deleted',
    action,
    entityType: null,
    resourceType: 'membership',
    tableName: 'memberships',
    subjectId: `mem-${ORG}-${userId}`,
    tenantId: 'tenant-1',
    organizationId: ORG,
    rowData: { id: `mem-${ORG}-${userId}`, userId, channelType: 'organization', channelId: ORG, organizationId: ORG, role: memberRole },
    seq: null,
    batchUntilSeq: null,
    propagation: null,
    trace: null,
    stx: null,
  }) as unknown as ActivityEvent;

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Sends a status payload the way the worker's socket delivers one. */
const workerReports = (generation: number) =>
  (cdcWebSocketServer as unknown as { handleMessage: (data: string) => void }).handleMessage(
    JSON.stringify({ _control: 'health', payload: { replicationStatus: 'active', lastLsn: null, messagesSent: 0, generation } }),
  );

afterEach(() => {
  for (const subscriber of streamSubscriberManager.all()) streamSubscriberManager.unregister(subscriber.id);
});

describe('entities listeners: a membership change on open streams', () => {
  it('must not leave a removed member with the membership their stream opened on', async () => {
    const removed = fakeSubscriber('removed-user');
    const staying = fakeSubscriber('staying-user');

    activityBus.emit(membershipEvent('delete', 'removed-user'));
    await settle();

    // The stream's own copy of the memberships is what every later change is checked against.
    expect(removed.subscriber.memberships).toEqual([]);
    expect(staying.subscriber.memberships).toHaveLength(1);
    // And the user hears of it on their own channel.
    expect(removed.sent.map((message) => JSON.parse(message.data))).toEqual([expect.objectContaining({ kind: 'membership', action: 'delete' })]);
    expect(staying.sent).toEqual([]);
  });

  it('gives a new member the membership on their open stream', async () => {
    const joiner = fakeSubscriber('joiner-user');
    joiner.subscriber.memberships = [];

    activityBus.emit(membershipEvent('create', 'joiner-user'));
    await settle();

    expect(joiner.subscriber.memberships).toHaveLength(1);
  });
});

describe('entities listeners: the worker rebuilt its books', () => {
  it('ends every app stream with resync when the generation moves, and leaves them alone while it stays', async () => {
    workerReports(4);
    const first = fakeSubscriber('first-user');
    const second = fakeSubscriber('second-user');

    // The same generation again: nothing happened.
    workerReports(4);
    await settle();
    expect(first.isClosed()).toBe(false);

    workerReports(5);
    await settle();

    for (const { sent, isClosed } of [first, second]) {
      expect(sent.map((message) => [message.event, JSON.parse(message.data).code])).toEqual([['error', 'resync']]);
      expect(isClosed()).toBe(true);
    }
    expect(streamSubscriberManager.all()).toEqual([]);
  });
});
