import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole, hierarchy } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { dispatchToAppStream } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { StreamNotification } from '#/schemas';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamEvent } from './types';

/** The organization vocabulary's floor role: `member` in cella; apps with other vocabularies still run this file unchanged. */
const memberRole = hierarchy.getLeastPrivilegedRole('organization');

// The dispatcher must notify exactly the subscribers permitted to read each event row.
const ORG_A = 'org-dispatch-a';
const ORG_B = 'org-dispatch-b';

const membership = (organizationId: string, role: EntityRole, userId: string): MembershipBaseModel =>
  ({
    id: `mem-organization-${organizationId}-${role}-${userId}`,
    userId,
    channelType: 'organization',
    channelId: organizationId,
    organizationId,
    role,
  }) as unknown as MembershipBaseModel;

/** Fake SSE subscriber capturing every notification written to its stream. */
const fakeSubscriber = (
  memberships: MembershipBaseModel[],
  userId: string,
  organizationIds: string[],
  channelOrg: string,
) => {
  const received: StreamNotification[] = [];
  const stream = {
    writeSSE: async ({ data }: { data: string }) => {
      received.push(JSON.parse(data));
    },
  } as unknown as SSEStreamingApi;

  const subscriber: AppStreamSubscriber = {
    id: crypto.randomUUID(),
    channel: `org:${channelOrg}`,
    stream,
    userId,
    organizationIds: new Set(organizationIds),
    isSystemAdmin: false,
    memberships,
    cursor: null,
  };
  return { subscriber, received };
};

/**
 * Rows and events must carry the full ancestor scope: `null`, not absent, for contexts the row
 * is not homed under, or `buildSubject` fail-closes with MissingScopeError.
 */
const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

const attachmentRow = (id: string, organizationId: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizationId,
  ...nullAncestorScopes,
  createdBy: 'author-user',
  ...extra,
});

const attachmentEvent = (organizationId: string, overrides: Record<string, unknown>): ActivityEvent =>
  ({
    id: 'activity-1',
    type: 'attachment.created',
    action: 'create',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    subjectId: 'attachment-1',
    tenantId: 'tenant-1',
    organizationId,
    ...nullAncestorScopes,
    rowData: null,
    seq: 7,
    batchUntilSeq: null,
    propagation: null,
    trace: null,
    stx: null,
    ...overrides,
  }) as unknown as ActivityEvent;

afterEach(() => {
  // Fake subscribers are registered per test; drop them so tests stay isolated.
  for (const org of [ORG_A, ORG_B]) {
    for (const subscriber of streamSubscriberManager.getByChannel(`org:${org}`)) {
      streamSubscriberManager.unregister(subscriber.id);
    }
  }
});

describe('dispatch mirror: org membership, live snapshots, batches', () => {
  it('pings org members; a subscriber whose membership is gone gets nothing despite channel registration', async () => {
    const member = fakeSubscriber([membership(ORG_A, memberRole, 'member-user')], 'member-user', [ORG_A], ORG_A);
    const admin = fakeSubscriber([membership(ORG_A, 'admin', 'admin-user')], 'admin-user', [ORG_A], ORG_A);
    // Membership deleted after connect: registration happened at connect time, so the engine
    // must deny per event.
    const stale = fakeSubscriber([], 'stale-user', [ORG_A], ORG_A);
    const otherOrg = fakeSubscriber([membership(ORG_B, memberRole, 'other-user')], 'other-user', [ORG_B], ORG_B);
    for (const { subscriber } of [member, admin, stale, otherOrg]) {
      streamSubscriberManager.register(subscriber);
    }

    // Authored by the org member, so read stays granted under a row-conditional read:'own' grant.
    await dispatchToAppStream(
      attachmentEvent(ORG_A, {
        rowData: attachmentRow('attachment-1', ORG_A, { createdBy: 'member-user' }),
      }) as AppStreamEvent,
    );

    expect(member.received).toHaveLength(1); // org member: read granted
    expect(admin.received).toHaveLength(1); // org admin: read granted
    expect(stale.received).toHaveLength(0); // no live membership: engine denies
    expect(otherOrg.received).toHaveLength(0); // different org channel entirely
  });

  it('pings a subscriber who can read only a non-representative batch row', async () => {
    // A stale channel registration after membership removal: dispatch must still evaluate each row.
    const { subscriber, received } = fakeSubscriber(
      [membership(ORG_A, memberRole, 'moved-user')],
      'moved-user',
      [ORG_A, ORG_B],
      ORG_B,
    );
    streamSubscriberManager.register(subscriber);

    // The representative first row is in unreadable org B, the second in org A: representative-row
    // dispatch would have skipped this subscriber.
    await dispatchToAppStream(
      attachmentEvent(ORG_B, {
        seq: 20,
        batchUntilSeq: 21,
        rowData: attachmentRow('attachment-a', ORG_B),
        batchRows: [
          { seq: 20, rowData: attachmentRow('attachment-a', ORG_B) },
          // Authored by the subscriber, so readable under both read:1 and read:'own'.
          { seq: 21, rowData: attachmentRow('attachment-b', ORG_A, { createdBy: 'moved-user' }) },
        ],
      }) as AppStreamEvent,
    );

    expect(received).toHaveLength(1);
  });

  it('drops draft rows for everyone: author and admin included (defense-in-depth veto)', async () => {
    // The publication row filter keeps drafts out of the stream at the source; this veto is the
    // fail-closed backstop if that filter is missing, and holds for everyone, the author included.
    const author = fakeSubscriber([membership(ORG_A, memberRole, 'author-user')], 'author-user', [ORG_A], ORG_A);
    const admin = fakeSubscriber([membership(ORG_A, 'admin', 'admin-user')], 'admin-user', [ORG_A], ORG_A);
    for (const { subscriber } of [author, admin]) {
      streamSubscriberManager.register(subscriber);
    }

    await dispatchToAppStream(
      attachmentEvent(ORG_A, {
        rowData: attachmentRow('attachment-draft', ORG_A, { createdBy: 'author-user', publishedAt: null }),
      }) as AppStreamEvent,
    );

    expect(author.received).toHaveLength(0);
    expect(admin.received).toHaveLength(0);
  });

  it('an unpublish arrives as DELETE with the old published row: old readers get the delete', async () => {
    // PostgreSQL exposes unpublish as DELETE with the old published row, so existing readers must
    // receive the normal delete-style invalidation.
    const member = fakeSubscriber([membership(ORG_A, memberRole, 'member-user')], 'member-user', [ORG_A], ORG_A);
    const otherOrg = fakeSubscriber([membership(ORG_B, memberRole, 'other-user')], 'other-user', [ORG_B], ORG_B);
    for (const { subscriber } of [member, otherOrg]) {
      streamSubscriberManager.register(subscriber);
    }

    await dispatchToAppStream(
      attachmentEvent(ORG_A, {
        type: 'attachment.deleted',
        action: 'delete',
        rowData: attachmentRow('attachment-unpublished', ORG_A, {
          createdBy: 'member-user',
          publishedAt: '2026-07-04T09:00:00.000Z',
        }),
      }) as AppStreamEvent,
    );

    expect(member.received).toHaveLength(1);
    expect(member.received[0]).toMatchObject({ action: 'delete', productType: 'attachment' });
    expect(otherOrg.received).toHaveLength(0);
  });

  it('a published row (publishedAt set) dispatches normally: the veto only hits null', async () => {
    const member = fakeSubscriber([membership(ORG_A, memberRole, 'member-user')], 'member-user', [ORG_A], ORG_A);
    streamSubscriberManager.register(member.subscriber);

    await dispatchToAppStream(
      attachmentEvent(ORG_A, {
        rowData: attachmentRow('attachment-published', ORG_A, {
          createdBy: 'member-user',
          publishedAt: '2026-07-04T09:00:00.000Z',
        }),
      }) as AppStreamEvent,
    );

    expect(member.received).toHaveLength(1);
  });

  it('delivers a self-membership in an unregistered org through the user channel', async () => {
    // Connected as a member of ORG_A only, so the new-org invite can arrive only via the user
    // channel. The bystander shares the org channel but must not receive that event.
    const joiner = fakeSubscriber([membership(ORG_A, memberRole, 'joiner-user')], 'joiner-user', [ORG_A], ORG_A);
    const bystander = fakeSubscriber(
      [membership(ORG_A, memberRole, 'bystander-user')],
      'bystander-user',
      [ORG_A],
      ORG_A,
    );
    streamSubscriberManager.register(joiner.subscriber, ['user:joiner-user']);
    streamSubscriberManager.register(bystander.subscriber, ['user:bystander-user']);

    const membershipEvent = {
      id: 'activity-membership-1',
      type: 'membership.created',
      action: 'create',
      entityType: null,
      resourceType: 'membership',
      tableName: 'memberships',
      subjectId: 'mem-new-org',
      tenantId: 'tenant-1',
      organizationId: ORG_B,
      rowData: {
        id: 'mem-new-org',
        userId: 'joiner-user',
        channelType: 'organization',
        channelId: ORG_B,
        organizationId: ORG_B,
        role: memberRole,
      },
      seq: null,
      batchUntilSeq: null,
      propagation: null,
      trace: null,
      stx: null,
    } as unknown as ActivityEvent;

    await dispatchToAppStream(membershipEvent as AppStreamEvent);

    expect(joiner.received).toHaveLength(1);
    expect(joiner.received[0]).toMatchObject({ kind: 'membership', action: 'create' });
    expect(bystander.received).toHaveLength(0);
  });

  it('does not ping anyone for a batch with no readable rows', async () => {
    const { subscriber, received } = fakeSubscriber(
      [membership(ORG_A, memberRole, 'moved-user')],
      'moved-user',
      [ORG_A, ORG_B],
      ORG_B,
    );
    streamSubscriberManager.register(subscriber);

    await dispatchToAppStream(
      attachmentEvent(ORG_B, {
        seq: 30,
        batchUntilSeq: 31,
        rowData: attachmentRow('attachment-a', ORG_B),
        batchRows: [
          { seq: 30, rowData: attachmentRow('attachment-a', ORG_B) },
          { seq: 31, rowData: attachmentRow('attachment-b', ORG_B) },
        ],
      }) as AppStreamEvent,
    );

    expect(received).toHaveLength(0);
  });
});
