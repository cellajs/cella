import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole } from 'shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type ActivityEvent, type ActivityRow, activityBus } from '#/lib/activity-bus';
import { cdcWebSocketServer } from '#/lib/cdc-websocket';
import { defineBackendModule } from '#/lib/module';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { memberRole } from '../../../tests/fixtures';
import { changeBundleMs, closeChangeBundles, sendHeldChanges } from './stream/change-bundles';
import { streamSubscriberManager } from './stream/subscriber-manager';
import { streamSubscriber } from './stream/tests/stream-subscriber';
import './entities-listeners';

const org = 'org-listeners';

// The memberships module declares the signal; this file loads the listeners alone.
defineBackendModule({
  name: 'entities-listeners-test',
  owner: 'cella',
  description: 'Declares the membership signal the listeners send',
  scope: ['backend'],
  signals: [{ type: 'membership.changed', audiences: ['user', 'readers'] }],
});

const membership = (role: EntityRole, userId: string): MembershipBaseModel =>
  ({ id: `mem-${org}-${userId}`, userId, channelType: 'organization', channelId: org, organizationId: org, role }) as unknown as MembershipBaseModel;

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
  const subscriber = streamSubscriber(userId, stream, [membership(memberRole, userId)], org);
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
    subjectId: `mem-${org}-${userId}`,
    tenantId: 'tenant-1',
    organizationId: org,
    rowData: { id: `mem-${org}-${userId}`, userId, channelType: 'organization', channelId: org, organizationId: org, role: memberRole },
    rows: null,
    trace: null,
    stx: null,
  }) as unknown as ActivityEvent;

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

/** Sends a status payload the way the worker's socket delivers one. */
const workerReports = (generation: number) =>
  (cdcWebSocketServer as unknown as { handleMessage: (data: string) => void }).handleMessage(
    JSON.stringify({ _control: 'health', payload: { status: 'healthy', reasons: [], details: { replication: 'active' }, generation } }),
  );

afterEach(async () => {
  await sendHeldChanges();
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
    // The user hears of their own membership; the organization's remaining readers hear that its member lists changed.
    expect(removed.sent.map(({ event, data }) => [event, JSON.parse(data)])).toEqual([
      ['signal', { type: 'membership.changed', organizationId: org, subjectId: `mem-${org}-removed-user` }],
    ]);
    expect(staying.sent.map(({ event, data }) => [event, JSON.parse(data)])).toEqual([
      ['signal', { type: 'membership.changed', organizationId: org, subjectId: null }],
    ]);
  });

  it('gives a new member the membership on their open stream', async () => {
    const joiner = fakeSubscriber('joiner-user');
    joiner.subscriber.memberships = [];

    activityBus.emit(membershipEvent('create', 'joiner-user'));
    await settle();

    expect(joiner.subscriber.memberships).toHaveLength(1);
  });
});

// A row names every ancestor its product can have, null where it has none: an app may home the product below the organization.
const noDeeperAncestors = Object.fromEntries(
  appConfig.channelEntityTypes.filter((type) => type !== 'organization').map((type) => [appConfig.entityIdColumnKeys[type], null]),
);
const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizationId: org,
  ...noDeeperAncestors,
  createdBy: 'author-user',
  ...extra,
});

/** A product change as the socket hands it to the bus: its rows, each with the activity of its write. */
const productEvent = (action: 'create' | 'update' | 'delete', rows: Pick<ActivityRow, 'seq' | 'rowData' | 'movedFrom'>[]): ActivityEvent =>
  ({
    type: `attachment.${action}d`,
    action,
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    tenantId: 'tenant-1',
    organizationId: org,
    rowData: null,
    rows: rows.map((row) => ({ activityId: `act-${row.rowData.id}-${row.seq}`, actorId: null, changedFields: null, stx: null, ...row })),
    trace: null,
  }) as unknown as ActivityEvent;
const updateEvent = (rows: Pick<ActivityRow, 'seq' | 'rowData' | 'movedFrom'>[]) => productEvent('update', rows);

/** A reader of every attachment of the organization, by its role alone. */
const adminReader = (userId: string) => {
  const reader = fakeSubscriber(userId);
  reader.subscriber.memberships = [membership('admin', userId)];
  return reader;
};

/** Each change frame a stream was sent: its action and, per row, its id and seq. */
const framesOf = (sent: { event?: string; data: string }[]) =>
  sent
    .filter(({ event }) => event === 'change')
    .map(({ data }) => {
      const { action, rows } = JSON.parse(data) as { action: string; rows: { subjectId: string; seq: number | null }[] };
      return [action, rows.map(({ subjectId, seq }) => `${subjectId}@${seq}`)];
    });

describe('entities listeners: a product change on open streams', () => {
  it('tells a reader the update, and the loss of each row a move took out of its reach', async () => {
    const reader = fakeSubscriber('reader-user');
    // Read by the role alone, whatever the app grants a member: the difference below comes from the draft veto.
    reader.subscriber.memberships = [membership('admin', 'reader-user')];

    activityBus.emit(
      updateEvent([
        { seq: 4, rowData: row('att-kept') },
        // Moved to where nobody reads it: an unpublished draft.
        { seq: 6, rowData: row('att-lost', { publishedAt: null }), movedFrom: row('att-lost', { publishedAt: '2026-07-01T00:00:00Z' }) },
      ]),
    );
    await settle();

    // The update names the row the reader still reads; the lost one arrives as its own removal.
    expect(reader.sent.map((message) => JSON.parse(message.data))).toEqual([
      expect.objectContaining({ action: 'update', rows: [expect.objectContaining({ subjectId: 'att-kept', seq: 4 })] }),
      expect.objectContaining({ action: 'moveOut', rows: [expect.objectContaining({ subjectId: 'att-lost', seq: 6 })] }),
    ]);
  });
});

describe('entities listeners: the worker rebuilt its books', () => {
  it('ends every stream with resync when the generation moves, and leaves them alone while it stays', async () => {
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

describe('entities listeners: an audience under sustained change', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await sendHeldChanges();
    vi.useRealTimers();
  });

  /** Emits a change and lets its listener run. */
  const change = async (event: ActivityEvent) => {
    activityBus.emit(event);
    await vi.advanceTimersByTimeAsync(0);
  };

  it('must not send a held change to a member removed before the interval ends', async () => {
    const staying = adminReader('staying-user');
    const removed = adminReader('removed-user');

    await change(updateEvent([{ seq: 1, rowData: row('att-1') }]));
    await change(updateEvent([{ seq: 2, rowData: row('att-2') }]));
    activityBus.emit(membershipEvent('delete', 'removed-user'));
    await vi.advanceTimersByTimeAsync(changeBundleMs);

    expect(framesOf(staying.sent)).toEqual([
      ['update', ['att-1@1']],
      ['update', ['att-2@2']],
    ]);
    expect(framesOf(removed.sent)).toEqual([['update', ['att-1@1']]]);
  });

  it('sends the first change after a quiet interval at once, and the next when the interval ends', async () => {
    const reader = adminReader('reader-user');

    await change(updateEvent([{ seq: 1, rowData: row('att-1') }]));
    expect(framesOf(reader.sent)).toHaveLength(1);
    await change(updateEvent([{ seq: 2, rowData: row('att-2') }]));
    await vi.advanceTimersByTimeAsync(changeBundleMs - 1);
    expect(framesOf(reader.sent)).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(framesOf(reader.sent)).toHaveLength(2);

    // An interval that held nothing closes: the audience is quiet again.
    await vi.advanceTimersByTimeAsync(changeBundleMs);
    await change(updateEvent([{ seq: 3, rowData: row('att-3') }]));
    expect(framesOf(reader.sent)).toEqual([
      ['update', ['att-1@1']],
      ['update', ['att-2@2']],
      ['update', ['att-3@3']],
    ]);
  });

  it('holds each row once with its latest change: a create stays a create, a delete replaces a create or update, a restore a delete', async () => {
    const reader = adminReader('reader-user');

    await change(updateEvent([{ seq: 1, rowData: row('att-0') }]));
    await change(productEvent('create', [{ seq: 2, rowData: row('att-1') }]));
    await change(updateEvent([{ seq: 3, rowData: row('att-1') }]));
    await change(productEvent('create', [{ seq: 4, rowData: row('att-2') }]));
    await change(updateEvent([{ seq: 5, rowData: row('att-3') }]));
    await change(productEvent('delete', [{ rowData: row('att-2') }, { rowData: row('att-3') }]));
    await change(productEvent('delete', [{ seq: 6, rowData: row('att-4') }]));
    await change(productEvent('create', [{ seq: 7, rowData: row('att-4') }]));
    await vi.advanceTimersByTimeAsync(changeBundleMs);

    expect(framesOf(reader.sent)).toEqual([
      ['update', ['att-0@1']],
      ['create', ['att-1@3', 'att-4@7']],
      ['delete', ['att-2@null', 'att-3@null']],
    ]);
  });

  it('keeps the order of a stream when a change that goes at once follows a held one', async () => {
    const reader = adminReader('reader-user');

    await change(updateEvent([{ seq: 1, rowData: row('att-1') }]));
    await change(updateEvent([{ seq: 2, rowData: row('att-2') }]));
    // A move goes at once, after what its audience holds.
    await change(updateEvent([{ seq: 3, rowData: row('att-3'), movedFrom: row('att-3') }]));

    expect(framesOf(reader.sent)).toEqual([
      ['update', ['att-1@1']],
      ['update', ['att-2@2']],
      ['update', ['att-3@3']],
    ]);
  });

  it('sends at once when a frame reaches the row bound, naming each row', async () => {
    const reader = adminReader('reader-user');

    await change(updateEvent([{ seq: 0, rowData: row('att-0') }]));
    for (let seq = 1; seq <= 21; seq++) await change(updateEvent([{ seq, rowData: row(`att-${seq}`) }]));

    const frames = reader.sent.filter(({ event }) => event === 'change').map(({ data }) => JSON.parse(data));
    expect(frames).toHaveLength(2);
    expect(frames[1]).toMatchObject({ overflow: null });
    expect(frames[1].rows).toHaveLength(20);
    expect(frames[1].rows[19]).toMatchObject({ subjectId: 'att-20', seq: 20 });
  });

  // Last in the file: the bundles stay closed for the rest of the process.
  it('sends what is held at shutdown, and every later change at once', async () => {
    const reader = adminReader('reader-user');

    await change(updateEvent([{ seq: 1, rowData: row('att-1') }]));
    await change(updateEvent([{ seq: 2, rowData: row('att-2') }]));
    await closeChangeBundles();
    await change(updateEvent([{ seq: 3, rowData: row('att-3') }]));
    await change(updateEvent([{ seq: 4, rowData: row('att-4') }]));

    expect(framesOf(reader.sent)).toEqual([
      ['update', ['att-1@1']],
      ['update', ['att-2@2']],
      ['update', ['att-3@3']],
      ['update', ['att-4@4']],
    ]);
  });
});
