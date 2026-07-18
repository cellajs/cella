import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityEvent } from '#/lib/activity-bus';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { dispatchToAppStream } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import type { StreamNotification } from '#/schemas';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamEvent } from './types';

// The dispatcher must notify exactly the subscribers permitted to read each event row.
// Row-predicate parity is covered by the permission property tests.
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
 * Rows and events must carry the full ancestor scope of the configured hierarchy.
 * `null` (not absent) for contexts the row isn't homed under, or `buildSubject`
 * fail-closes with MissingScopeError. Empty in base cella (organization only); forks
 * with deeper chains (e.g. project) get their id columns nulled here.
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
    // but channel registration occurs at connect time. The engine must deny per event.
    const stale = fakeSubscriber([], 'stale-user', [ORG_A], ORG_A);
    const otherOrg = fakeSubscriber([membership(ORG_B, 'member', 'other-user')], 'other-user', [ORG_B], ORG_B);
    for (const { subscriber } of [member, admin, stale, otherOrg]) {
      streamSubscriberManager.register(subscriber);
    }

    // Row authored by the org member: keeps "read granted" true under forks where org
    // members hold a row-conditional read:'own' grant, not an unconditional read grant.
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
    // Subscriber connected while a member of both orgs (registered on org:B), but the
    // org-B membership is gone from the live snapshot. CDC splits batch messages per seq
    // context (per org here), so mixed-org rows in one message should not occur on the
    // wire. Dispatch still evaluates per row and must not assume it.
    const { subscriber, received } = fakeSubscriber(
      [membership(ORG_A, 'member', 'moved-user')],
      'moved-user',
      [ORG_A, ORG_B],
      ORG_B,
    );
    streamSubscriberManager.register(subscriber);

    // The representative first row lives in unreadable org B; the second row is in org A.
    // under representative-row dispatch this subscriber would have been skipped
    await dispatchToAppStream(
      attachmentEvent(ORG_B, {
        seq: 20,
        batchUntilSeq: 21,
        rowData: attachmentRow('attachment-a', ORG_B),
        batchRows: [
          { seq: 20, rowData: attachmentRow('attachment-a', ORG_B) },
          // Authored by the subscriber: readable under both read:1 and read:'own' configs
          { seq: 21, rowData: attachmentRow('attachment-b', ORG_A, { createdBy: 'moved-user' }) },
        ],
      }) as AppStreamEvent,
    );

    expect(received).toHaveLength(1);
  });

  it('drops draft rows for everyone — author and admin included (defense-in-depth veto)', async () => {
    // The publication row filter keeps drafts out of the stream at the source; this veto
    // is the fail-closed backstop for a misconfigured fork (filter missing). It must
    // still hold for EVERYONE, author included.
    const author = fakeSubscriber([membership(ORG_A, 'member', 'author-user')], 'author-user', [ORG_A], ORG_A);
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
    // The publication row filter rewrites unpublish (published → draft) into a DELETE
    // whose rowData is the OLD published row (REPLICA IDENTITY FULL). Readers of that
    // row receive the ordinary hard-delete invalidation, an upgrade over the pre-filter
    // model, where unpublish notified nobody and surfaced only as count drift.
    const member = fakeSubscriber([membership(ORG_A, 'member', 'member-user')], 'member-user', [ORG_A], ORG_A);
    const otherOrg = fakeSubscriber([membership(ORG_B, 'member', 'other-user')], 'other-user', [ORG_B], ORG_B);
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
    expect(member.received[0]).toMatchObject({ action: 'delete', entityType: 'attachment' });
    expect(otherOrg.received).toHaveLength(0);
  });

  it('a published row (publishedAt set) dispatches normally — the veto only hits null', async () => {
    const member = fakeSubscriber([membership(ORG_A, 'member', 'member-user')], 'member-user', [ORG_A], ORG_A);
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
