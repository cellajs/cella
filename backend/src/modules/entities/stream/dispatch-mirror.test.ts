import type { SSEStreamingApi } from 'hono/streaming';
import type { EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { dispatchToAppStream } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { StreamNotification } from '#/schemas';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamEvent } from './types';

/**
 * Dispatch-mirror behavior on the real dispatcher: pings go to exactly the subscribers
 * who can read the event's row(s) — org membership under cella's 2-level config, batches
 * per row. Row-level permission parity itself is covered by the three-way property test
 * in permissions/row-predicates.test.ts.
 */

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
    sessionToken: 'test-session-token',
    organizationIds: new Set(organizationIds),
    isSystemAdmin: false,
    memberships,
    cursor: null,
  };
  return { subscriber, received };
};

const attachmentRow = (id: string, organizationId: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizationId,
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
    rowData: null,
    cacheToken: null,
    seq: 7,
    batchUntilSeq: null,
    propagation: null,
    trace: null,
    stx: null,
    ...overrides,
  }) as unknown as ActivityEvent;

afterEach(() => {
  // Fake subscribers are registered per test; drop them so tests stay isolated
  for (const org of [ORG_A, ORG_B]) {
    for (const subscriber of streamSubscriberManager.getByChannel(`org:${org}`)) {
      streamSubscriberManager.unregister(subscriber.id);
    }
  }
});

describe('dispatch mirror: org membership, live snapshots, batches', () => {
  it('pings org members; a subscriber whose membership is gone gets nothing despite channel registration', async () => {
    const member = fakeSubscriber([membership(ORG_A, 'member', 'member-user')], 'member-user', [ORG_A], ORG_A);
    const admin = fakeSubscriber([membership(ORG_A, 'admin', 'admin-user')], 'admin-user', [ORG_A], ORG_A);
    // Membership deleted after connect: the listener refreshed the snapshot to empty,
    // but channel registration is connect-time — the engine must deny per event.
    const stale = fakeSubscriber([], 'stale-user', [ORG_A], ORG_A);
    const otherOrg = fakeSubscriber([membership(ORG_B, 'member', 'other-user')], 'other-user', [ORG_B], ORG_B);
    for (const { subscriber } of [member, admin, stale, otherOrg]) {
      streamSubscriberManager.register(subscriber);
    }

    await dispatchToAppStream(
      attachmentEvent(ORG_A, { rowData: attachmentRow('attachment-1', ORG_A) }) as AppStreamEvent,
    );

    expect(member.received).toHaveLength(1); // org member: read granted
    expect(admin.received).toHaveLength(1); // org admin: read granted
    expect(stale.received).toHaveLength(0); // no live membership: engine denies
    expect(otherOrg.received).toHaveLength(0); // different org channel entirely
  });

  it('pings a subscriber who can read only a non-representative batch row', async () => {
    // Subscriber connected while a member of both orgs (registered on org:B), but the
    // org-B membership is gone from the live snapshot. CDC splits batch messages per seq
    // context (per org here), so mixed-org rows in one message should not occur on the
    // wire — dispatch still evaluates per row and must not assume it.
    const { subscriber, received } = fakeSubscriber(
      [membership(ORG_A, 'member', 'moved-user')],
      'moved-user',
      [ORG_A, ORG_B],
      ORG_B,
    );
    streamSubscriberManager.register(subscriber);

    // Representative (first) row lives in org B (unreadable); the second row is in org A —
    // under representative-row dispatch this subscriber would have been skipped
    await dispatchToAppStream(
      attachmentEvent(ORG_B, {
        seq: 20,
        batchUntilSeq: 21,
        rowData: attachmentRow('attachment-a', ORG_B),
        batchRows: [
          { seq: 20, rowData: attachmentRow('attachment-a', ORG_B) },
          { seq: 21, rowData: attachmentRow('attachment-b', ORG_A) },
        ],
      }) as AppStreamEvent,
    );

    expect(received).toHaveLength(1);
  });

  it('does not ping anyone for a batch with no readable rows', async () => {
    const { subscriber, received } = fakeSubscriber(
      [membership(ORG_A, 'member', 'moved-user')],
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
