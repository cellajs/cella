import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { dispatchMoveOuts } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { StreamNotification } from '#/schemas';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamProductEvent } from './types';

/**
 * Move-out dispatch: exactly the subscribers who could read the OLD location but not
 * the new one receive `action: 'moveOut'` carrying the old path. Base cella's org-only
 * topology cannot lose readability across channels, so the readability difference here
 * is produced through the draft veto, the same canReceiveEntityEvent every fork's
 * channel differences flow through. In production such an unpublish+move UPDATE no
 * longer occurs (the publication row filter delivers it as a DELETE; see
 * dispatch-mirror.test.ts), but the veto stays as the fail-closed backstop and gives
 * these tests a fork-independent readability difference to exercise.
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
    const member = fakeSubscriber([membership(ORG, 'member', 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    // New row is an unpublished draft (veto: unreadable for everyone); old row was published.
    await dispatchMoveOuts(
      updateEvent({
        rowData: row('att-1', { path: `${ORG}/new-spot`, publishedAt: null }),
        movedFrom: row('att-1', { path: `${ORG}/old-spot`, publishedAt: '2026-07-01T00:00:00Z' }),
      }),
    );

    expect(member.received).toHaveLength(1);
    expect(member.received[0]).toMatchObject({
      kind: 'entity',
      action: 'moveOut',
      entityType: 'attachment',
      subjectId: 'att-1',
      path: `${ORG}/old-spot`,
      batchUntilSeq: null,
      count: 1,
    });
  });

  it('does NOT send moveOut to subscribers who can read both locations (normal update routes it)', async () => {
    const member = fakeSubscriber([membership(ORG, 'member', 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    await dispatchMoveOuts(
      updateEvent({
        rowData: row('att-1', { path: `${ORG}/new-spot` }),
        movedFrom: row('att-1', { path: `${ORG}/old-spot` }),
      }),
    );

    expect(member.received).toHaveLength(0);
  });

  it('is a no-op for events without movedFrom', async () => {
    const member = fakeSubscriber([membership(ORG, 'member', 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    await dispatchMoveOuts(updateEvent({ rowData: row('att-1', { path: `${ORG}/spot` }) }));

    expect(member.received).toHaveLength(0);
  });

  it('handles per-row movedFrom in batches, one moveOut per moved row', async () => {
    const member = fakeSubscriber([membership(ORG, 'member', 'member-user')], 'member-user');
    streamSubscriberManager.register(member.subscriber);

    await dispatchMoveOuts(
      updateEvent({
        rowData: row('att-1', { path: `${ORG}/a` }),
        batchRows: [
          // Moved AND unpublished → moveOut for the org member.
          {
            seq: 8,
            rowData: row('att-2', { path: `${ORG}/b-new`, publishedAt: null }),
            movedFrom: row('att-2', { path: `${ORG}/b-old`, publishedAt: '2026-07-01T00:00:00Z' }),
          },
          // Moved but still readable → routed by the normal update, no moveOut.
          {
            seq: 9,
            rowData: row('att-3', { path: `${ORG}/c-new` }),
            movedFrom: row('att-3', { path: `${ORG}/c-old` }),
          },
          // Not moved at all.
          { seq: 10, rowData: row('att-4', { path: `${ORG}/d` }) },
        ],
      }),
    );

    expect(member.received).toHaveLength(1);
    expect(member.received[0]).toMatchObject({ action: 'moveOut', subjectId: 'att-2', path: `${ORG}/b-old` });
  });
});
