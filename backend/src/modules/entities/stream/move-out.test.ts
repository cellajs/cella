import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityRow } from '#/lib/activity-bus';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { dispatchMoveOuts } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { StreamNotification } from '#/schemas';
import { memberRole } from '../../../../tests/fixtures';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamProductEvent } from './types';

/**
 * Only subscribers losing read access receive `moveOut` with the old path. The draft veto creates
 * a configuration-independent visibility difference through the same permission path.
 */
const ORG = 'org-moveout-a';

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
  const received: StreamNotification[] = [];
  const stream = {
    writeSSE: async ({ data }: { data: string }) => {
      received.push(JSON.parse(data));
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
    memberships,
  };
  return { subscriber, received };
};

const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

const row = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizationId: ORG,
  ...nullAncestorScopes,
  createdBy: 'author-user',
  ...extra,
});

/** A product update as the bus delivers it: the activity of its first row, and its rows, each moved one with where it was. */
const updateEvent = (rows: ActivityRow[]): AppStreamProductEvent =>
  ({
    id: 'activity-mo-1',
    type: 'attachment.updated',
    action: 'update',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    subjectId: rows[0].rowData.id,
    tenantId: 'tenant-1',
    organizationId: ORG,
    ...nullAncestorScopes,
    rowData: null,
    rows,
    trace: null,
    stx: { mutationId: 'mut-1', sourceId: 'tab-a', fieldTimestamps: {} },
  }) as unknown as AppStreamProductEvent;

afterEach(() => {
  for (const subscriber of streamSubscriberManager.getByChannel(`org:${ORG}`)) {
    streamSubscriberManager.unregister(subscriber.id);
  }
});

describe('dispatchMoveOuts', () => {
  it('sends moveOut with the OLD path to subscribers who lost readability', async () => {
    const member = fakeSubscriber([membership(ORG, memberRole, 'member-user')], 'member-user');
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
      kind: 'product',
      action: 'moveOut',
      productType: 'attachment',
      subjectId: 'att-1',
      // Computed from movedFrom's ancestor ids; org-homed attachments resolve to the org id.
      path: ORG,
      seq: 7,
      // The removal is the payload: no range to fetch, and no stx although the event has one.
      batchUntilSeq: null,
      count: 1,
      stx: null,
    });
  });

  it('does NOT send moveOut to subscribers who can read both locations (normal update routes it)', async () => {
    const member = fakeSubscriber([membership(ORG, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    // Positive control: both rows are authored by the reader, so both locations are readable
    // under a read:'own' policy. Without that authorship the assertion could pass vacuously.
    await dispatchMoveOuts(
      updateEvent([{ seq: 7, rowData: row('att-1', { createdBy: 'member-user' }), movedFrom: row('att-1', { createdBy: 'member-user' }) }]),
    );

    expect(member.received).toHaveLength(0);
  });

  it('sends nothing for an event whose rows did not move', async () => {
    const member = fakeSubscriber([membership(ORG, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    await dispatchMoveOuts(updateEvent([{ seq: 7, rowData: row('att-1') }]));

    expect(member.received).toHaveLength(0);
  });

  it('sends one moveOut per moved row of an event of several rows, to those who lost that row', async () => {
    const member = fakeSubscriber([membership(ORG, memberRole, 'member-user')], 'member-user');
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
    // It names the moved row, with the lowest seq of the event.
    expect(member.received[0]).toMatchObject({ action: 'moveOut', subjectId: 'att-2', path: ORG, seq: 7, batchUntilSeq: null, count: 1 });
  });
});
