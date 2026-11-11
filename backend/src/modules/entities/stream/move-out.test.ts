import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityRow } from '#/lib/activity-bus';
import { dispatchMoveOuts } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { StreamChange } from '#/schemas';
import { memberRole } from '../../../../tests/fixtures';
import { streamSubscriberManager } from './subscriber-manager';
import { streamSubscriber } from './tests/stream-subscriber';
import type { StreamProductEvent } from './types';

/**
 * Only subscribers losing read access receive `moveOut`, under the old home channel. The draft veto creates
 * a configuration-independent visibility difference through the same permission path.
 */
const org = 'org-moveout-a';

const membership = (organizationId: string, role: EntityRole, userId: string): MembershipBaseModel =>
  ({
    id: `mem-organization-${organizationId}-${role}-${userId}`,
    userId,
    channelType: 'organization',
    channelId: organizationId,
    organizationId,
    role,
  }) as unknown as MembershipBaseModel;

const fakeSubscriber = (memberships: MembershipBaseModel[], userId: string) => {
  const received: StreamChange[] = [];
  const stream = {
    writeSSE: async ({ data }: { data: string }) => {
      received.push(JSON.parse(data));
    },
  } as unknown as SSEStreamingApi;

  return { subscriber: streamSubscriber(userId, stream, memberships, org), received };
};

const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizationId: org,
  ...nullAncestorScopes,
  createdBy: 'author-user',
  ...extra,
});

/** A product update as the bus delivers it: its rows, each with the activity of its write, a moved one with where it was. */
const updateEvent = (rows: Pick<ActivityRow, 'seq' | 'rowData' | 'movedFrom'>[]): StreamProductEvent =>
  ({
    type: 'attachment.updated',
    action: 'update',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    tenantId: 'tenant-1',
    organizationId: org,
    ...nullAncestorScopes,
    rowData: null,
    rows: rows.map((row) => ({
      activityId: `act-${row.rowData.id}`,
      actorId: 'writer-user',
      changedFields: null,
      stx: { mutationId: 'mut-1', sourceId: 'tab-a', fieldTimestamps: {} },
      ...row,
    })),
    trace: null,
  }) as unknown as StreamProductEvent;

afterEach(() => {
  for (const subscriber of streamSubscriberManager.getByTopic(`org:${org}`)) {
    streamSubscriberManager.unregister(subscriber.id);
  }
});

describe('dispatchMoveOuts', () => {
  it('sends moveOut to subscribers who lost readability', async () => {
    const member = fakeSubscriber([membership(org, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    // The new row is an unpublished draft, unreadable for everyone; the old row is published
    // and authored by the reader, so it stays readable under a read:'own' policy too.
    await dispatchMoveOuts(
      updateEvent([
        {
          seq: 7,
          rowData: row('att-1', { publishedAt: null }),
          movedFrom: row('att-1', { publishedAt: '2026-07-01T00:00:00Z', createdBy: 'member-user' }),
        },
      ]),
    );

    expect(member.received).toHaveLength(1);
    expect(member.received[0]).toMatchObject({
      action: 'moveOut',
      productType: 'attachment',
      // Computed from movedFrom's ancestor ids; org-homed attachments resolve to the org id.
      channelId: org,
      // The removal is the payload: no stx or writer although the row has them, so no tab takes it for its echo.
      rows: [{ subjectId: 'att-1', seq: 7, stx: null, actorId: null }],
    });
  });

  it('does NOT send moveOut to subscribers who can read both locations (normal update routes it)', async () => {
    const member = fakeSubscriber([membership(org, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    // Positive control: both rows are authored by the reader, so both locations are readable
    // under a read:'own' policy. Without that authorship the assertion could pass vacuously.
    await dispatchMoveOuts(
      updateEvent([{ seq: 7, rowData: row('att-1', { createdBy: 'member-user' }), movedFrom: row('att-1', { createdBy: 'member-user' }) }]),
    );

    expect(member.received).toHaveLength(0);
  });

  it('sends nothing for an event whose rows did not move', async () => {
    const member = fakeSubscriber([membership(org, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    await dispatchMoveOuts(updateEvent([{ seq: 7, rowData: row('att-1') }]));

    expect(member.received).toHaveLength(0);
  });

  it('sends each reader one moveOut of the moved rows it lost, and none of the others', async () => {
    const member = fakeSubscriber([membership(org, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    // Rows meant to be readable by member-user are authored by them, so they stay readable
    // under a read:'own' policy too, keeping the readability differences configuration-independent.
    await dispatchMoveOuts(
      updateEvent([
        // Not moved at all.
        { seq: 7, rowData: row('att-1') },
        // Moved and unpublished: moveOut for the org member.
        {
          seq: 8,
          rowData: row('att-2', { publishedAt: null }),
          movedFrom: row('att-2', { publishedAt: '2026-07-01T00:00:00Z', createdBy: 'member-user' }),
        },
        // Moved but still readable: routed by the normal update, no moveOut.
        { seq: 9, rowData: row('att-3', { createdBy: 'member-user' }), movedFrom: row('att-3', { createdBy: 'member-user' }) },
      ]),
    );

    expect(member.received).toHaveLength(1);
    // It names the moved row alone, with its own seq.
    expect(member.received[0]).toMatchObject({ action: 'moveOut', rows: [{ subjectId: 'att-2', seq: 8 }] });
  });

  it('sends each reader one frame for a reparent of 30 rows, naming them by id past the row cap', async () => {
    const admins = ['admin-a', 'admin-b'].map((userId) => fakeSubscriber([membership(org, 'admin', userId)], userId));
    const author = fakeSubscriber([membership(org, memberRole, 'member-user')], 'member-user');
    for (const { subscriber } of [...admins, author]) streamSubscriberManager.register(subscriber);

    // The rows become drafts, which nobody reads; the member authored the first 15, so it read them under read:'own' too.
    const ids = Array.from({ length: 30 }, (_, index) => `att-${index}`);
    const rows = ids.map((id, index) => ({
      seq: index + 1,
      rowData: row(id, { publishedAt: null }),
      movedFrom: row(id, { publishedAt: '2026-07-01T00:00:00Z', createdBy: index < 15 ? 'member-user' : 'author-user' }),
    }));
    await dispatchMoveOuts(updateEvent(rows));

    for (const { received } of admins) {
      expect(received).toEqual([
        expect.objectContaining({ action: 'moveOut', channelId: org, rows: [], overflow: { afterSeq: null, untilSeq: null, subjectIds: ids } }),
      ]);
    }
    // 15 rows or all 30, by the member policy: one frame either way.
    expect(author.received).toHaveLength(1);
    const named = [...author.received[0].rows.map(({ subjectId }) => subjectId), ...(author.received[0].overflow?.subjectIds ?? [])];
    expect(named).toEqual(expect.arrayContaining(ids.slice(0, 15)));
  });
});
