import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole, hierarchy } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { dispatchMoveOuts } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { StreamNotification } from '#/schemas';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamProductEvent } from './types';

/** The organization vocabulary's floor role: `member` in cella; apps with other vocabularies still run this file unchanged. */
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

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
    organizationIds: new Set([ORG]),
    isSystemAdmin: false,
    memberships,
    cursor: null,
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

const updateEvent = (overrides: Record<string, unknown>): AppStreamProductEvent =>
  ({
    id: 'activity-mo-1',
    type: 'attachment.updated',
    action: 'update',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    subjectId: 'att-1',
    tenantId: 'tenant-1',
    organizationId: ORG,
    ...nullAncestorScopes,
    rowData: null,
    seq: 7,
    batchUntilSeq: null,
    count: null,
    propagation: null,
    trace: null,
    stx: null,
    ...overrides,
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
      updateEvent({
        rowData: row('att-1', { publishedAt: null }),
        movedFrom: row('att-1', {
          publishedAt: '2026-07-01T00:00:00Z',
          createdBy: 'member-user',
        }),
      }),
    );

    expect(member.received).toHaveLength(1);
    expect(member.received[0]).toMatchObject({
      kind: 'product',
      action: 'moveOut',
      productType: 'attachment',
      subjectId: 'att-1',
      // Computed from movedFrom's ancestor ids; org-homed attachments resolve to the org id.
      path: ORG,
      batchUntilSeq: null,
      count: 1,
    });
  });

  it('does NOT send moveOut to subscribers who can read both locations (normal update routes it)', async () => {
    const member = fakeSubscriber([membership(ORG, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    // Positive control: both rows are authored by the reader, so both locations are readable
    // under a read:'own' policy. Without that authorship the assertion could pass vacuously.
    await dispatchMoveOuts(
      updateEvent({
        rowData: row('att-1', { createdBy: 'member-user' }),
        movedFrom: row('att-1', { createdBy: 'member-user' }),
      }),
    );

    expect(member.received).toHaveLength(0);
  });

  it('is a no-op for events without movedFrom', async () => {
    const member = fakeSubscriber([membership(ORG, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    await dispatchMoveOuts(updateEvent({ rowData: row('att-1') }));

    expect(member.received).toHaveLength(0);
  });

  it('handles per-row movedFrom in batches, one moveOut per moved row', async () => {
    const member = fakeSubscriber([membership(ORG, memberRole, 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    // Rows meant to be readable by member-user are authored by them, so they stay readable
    // under a read:'own' policy too, keeping the readability differences configuration-independent.
    await dispatchMoveOuts(
      updateEvent({
        rowData: row('att-1'),
        batchRows: [
          // Moved and unpublished: moveOut for the org member.
          {
            seq: 8,
            rowData: row('att-2', { publishedAt: null }),
            movedFrom: row('att-2', {
              publishedAt: '2026-07-01T00:00:00Z',
              createdBy: 'member-user',
            }),
          },
          // Moved but still readable: routed by the normal update, no moveOut.
          {
            seq: 9,
            rowData: row('att-3', { createdBy: 'member-user' }),
            movedFrom: row('att-3', { createdBy: 'member-user' }),
          },
          // Not moved at all.
          { seq: 10, rowData: row('att-4') },
        ],
      }),
    );

    expect(member.received).toHaveLength(1);
    expect(member.received[0]).toMatchObject({ action: 'moveOut', subjectId: 'att-2', path: ORG });
  });
});
