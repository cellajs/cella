import type { SSEStreamingApi } from 'hono/streaming';
import { appConfig, type EntityRole } from 'shared';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActivityEvent, ActivityRow } from '#/lib/activity-bus';
import type { AppStreamSubscriber } from '#/modules/entities/helpers/dispatch-to-stream';
import { dispatchToAppStream } from '#/modules/entities/helpers/dispatch-to-stream';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { mockMembershipBase } from '#/modules/memberships/memberships-mocks';
import type { StreamNotification } from '#/schemas';
import { memberRole } from '../../../../tests/fixtures';
import { streamSubscriberManager } from './subscriber-manager';
import type { AppStreamEvent } from './types';

// The dispatcher must notify exactly the subscribers permitted to read each event row.
const orgA = 'org-dispatch-a';
const orgB = 'org-dispatch-b';

const membership = (organizationId: string, role: EntityRole, userId: string): MembershipBaseModel =>
  mockMembershipBase(`mem-organization-${organizationId}-${role}-${userId}`, { channelId: organizationId, userId, role });

/** Fake SSE subscriber capturing every notification written to its stream. */
const fakeSubscriber = (memberships: MembershipBaseModel[], userId: string, organizationIds: string[], channelOrg: string) => {
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
    sessionId: `session-${userId}`,
    organizationIds: new Set(organizationIds),
    isSystemAdmin: false,
    systemAccessAllowed: false,
    memberships,
  };
  return { subscriber, received };
};

/**
 * Rows and events must carry the full ancestor scope: `null`, not absent, for contexts the row
 * is not homed under, or `buildSubject` fail-closes with MissingAncestorError.
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

/** A product event as the bus delivers it: the activity of its first row, and its rows with their permission fields. */
const attachmentEvent = (organizationId: string, rows: ActivityRow[], overrides: Record<string, unknown> = {}): ActivityEvent =>
  ({
    id: 'activity-1',
    type: 'attachment.created',
    action: 'create',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    subjectId: rows[0].rowData.id,
    tenantId: 'tenant-1',
    organizationId,
    ...nullAncestorScopes,
    rowData: null,
    rows,
    trace: null,
    stx: null,
    ...overrides,
  }) as unknown as ActivityEvent;

afterEach(() => {
  // Fake subscribers are registered per test; drop them so tests stay isolated.
  for (const org of [orgA, orgB]) {
    for (const subscriber of streamSubscriberManager.getByChannel(`org:${org}`)) {
      streamSubscriberManager.unregister(subscriber.id);
    }
  }
});

describe('dispatch mirror: org membership, live snapshots, events of several rows', () => {
  it('pings org members; a subscriber whose membership is gone gets nothing despite channel registration', async () => {
    const member = fakeSubscriber([membership(orgA, memberRole, 'member-user')], 'member-user', [orgA], orgA);
    const admin = fakeSubscriber([membership(orgA, 'admin', 'admin-user')], 'admin-user', [orgA], orgA);
    // Membership deleted after connect: registration happened at connect time, so the engine
    // must deny per event.
    const stale = fakeSubscriber([], 'stale-user', [orgA], orgA);
    const otherOrg = fakeSubscriber([membership(orgB, memberRole, 'other-user')], 'other-user', [orgB], orgB);
    for (const { subscriber } of [member, admin, stale, otherOrg]) {
      streamSubscriberManager.register(subscriber);
    }

    // Authored by the org member, so read stays granted under a row-conditional read:'own' grant.
    await dispatchToAppStream(
      attachmentEvent(orgA, [{ seq: 7, rowData: attachmentRow('attachment-1', orgA, { createdBy: 'member-user' }) }]) as AppStreamEvent,
    );

    expect(member.received).toHaveLength(1); // org member: read granted
    expect(admin.received).toHaveLength(1); // org admin: read granted
    expect(stale.received).toHaveLength(0); // no live membership: engine denies
    expect(otherOrg.received).toHaveLength(0); // different org channel entirely
  });

  it('pings a subscriber who can read only a row that is not the first', async () => {
    // A stale channel registration after membership removal: dispatch must still evaluate each row.
    const { subscriber, received } = fakeSubscriber([membership(orgA, memberRole, 'moved-user')], 'moved-user', [orgA, orgB], orgB);
    streamSubscriberManager.register(subscriber);

    // The first row is in unreadable org B, the second in org A: a dispatch that judged the first row alone would
    // have skipped this subscriber.
    await dispatchToAppStream(
      attachmentEvent(orgB, [
        { seq: 20, rowData: attachmentRow('attachment-a', orgB) },
        // Authored by the subscriber, so readable under both read:1 and read:'own'.
        { seq: 21, rowData: attachmentRow('attachment-b', orgA, { createdBy: 'moved-user' }) },
      ]) as AppStreamEvent,
    );

    expect(received).toHaveLength(1);
  });

  it("tells a reader of a one-row event that row's seq and the stx of its write, with no range to fetch", async () => {
    const member = fakeSubscriber([membership(orgA, 'admin', 'admin-user')], 'admin-user', [orgA], orgA);
    streamSubscriberManager.register(member.subscriber);
    const stx = { mutationId: 'mut-1', sourceId: 'tab-a', fieldTimestamps: {} };

    await dispatchToAppStream(attachmentEvent(orgA, [{ seq: 7, rowData: attachmentRow('attachment-1', orgA) }], { stx }) as AppStreamEvent);

    // The tab that wrote the row recognises its own write by the stx and fetches nothing.
    expect(member.received).toEqual([
      expect.objectContaining({ subjectId: 'attachment-1', path: orgA, seq: 7, stx, batchUntilSeq: null, count: null }),
    ]);
  });

  it('tells a reader of an event of several rows the range of their sequence values and how many rows it holds', async () => {
    const member = fakeSubscriber([membership(orgA, 'admin', 'admin-user')], 'admin-user', [orgA], orgA);
    streamSubscriberManager.register(member.subscriber);

    // Sequence values of one audience need not be contiguous or in order: 21 belongs to another audience.
    const rows = [22, 20, 23].map((seq) => ({ seq, rowData: attachmentRow(`attachment-${seq}`, orgA) }));
    await dispatchToAppStream(attachmentEvent(orgA, rows) as AppStreamEvent);

    expect(member.received).toEqual([expect.objectContaining({ subjectId: 'attachment-22', path: orgA, seq: 20, batchUntilSeq: 23, count: 3 })]);
  });

  it('gives deleted rows, which hold no seq, a notification without one', async () => {
    const member = fakeSubscriber([membership(orgA, 'admin', 'admin-user')], 'admin-user', [orgA], orgA);
    streamSubscriberManager.register(member.subscriber);
    const deleted = { type: 'attachment.deleted', action: 'delete' };

    await dispatchToAppStream(attachmentEvent(orgA, [{ rowData: attachmentRow('attachment-1', orgA) }], deleted) as AppStreamEvent);
    const rows = ['attachment-2', 'attachment-3'].map((id) => ({ rowData: attachmentRow(id, orgA) }));
    await dispatchToAppStream(attachmentEvent(orgA, rows, deleted) as AppStreamEvent);

    expect(member.received).toEqual([
      expect.objectContaining({ action: 'delete', subjectId: 'attachment-1', seq: null, batchUntilSeq: null, count: null }),
      expect.objectContaining({ action: 'delete', subjectId: 'attachment-2', seq: null, batchUntilSeq: null, count: 2 }),
    ]);
  });

  it('drops draft rows for everyone: author and admin included (defense-in-depth veto)', async () => {
    // The publication row filter keeps drafts out of the stream at the source; this veto is the
    // fail-closed backstop if that filter is missing, and holds for everyone, the author included.
    const author = fakeSubscriber([membership(orgA, memberRole, 'author-user')], 'author-user', [orgA], orgA);
    const admin = fakeSubscriber([membership(orgA, 'admin', 'admin-user')], 'admin-user', [orgA], orgA);
    for (const { subscriber } of [author, admin]) {
      streamSubscriberManager.register(subscriber);
    }

    await dispatchToAppStream(
      attachmentEvent(orgA, [
        { seq: 7, rowData: attachmentRow('attachment-draft', orgA, { createdBy: 'author-user', publishedAt: null }) },
      ]) as AppStreamEvent,
    );

    expect(author.received).toHaveLength(0);
    expect(admin.received).toHaveLength(0);
  });

  it('an unpublish arrives as DELETE with the old published row: old readers get the delete', async () => {
    // PostgreSQL exposes unpublish as DELETE with the old published row, so existing readers must
    // receive the normal delete-style invalidation.
    const member = fakeSubscriber([membership(orgA, memberRole, 'member-user')], 'member-user', [orgA], orgA);
    const otherOrg = fakeSubscriber([membership(orgB, memberRole, 'other-user')], 'other-user', [orgB], orgB);
    for (const { subscriber } of [member, otherOrg]) {
      streamSubscriberManager.register(subscriber);
    }

    const unpublished = attachmentRow('attachment-unpublished', orgA, { createdBy: 'member-user', publishedAt: '2026-07-04T09:00:00.000Z' });
    await dispatchToAppStream(attachmentEvent(orgA, [{ rowData: unpublished }], { type: 'attachment.deleted', action: 'delete' }) as AppStreamEvent);

    expect(member.received).toHaveLength(1);
    expect(member.received[0]).toMatchObject({ action: 'delete', productType: 'attachment' });
    expect(otherOrg.received).toHaveLength(0);
  });

  it('a published row (publishedAt set) dispatches normally: the veto only hits null', async () => {
    const member = fakeSubscriber([membership(orgA, memberRole, 'member-user')], 'member-user', [orgA], orgA);
    streamSubscriberManager.register(member.subscriber);

    const published = attachmentRow('attachment-published', orgA, { createdBy: 'member-user', publishedAt: '2026-07-04T09:00:00.000Z' });
    await dispatchToAppStream(attachmentEvent(orgA, [{ seq: 7, rowData: published }]) as AppStreamEvent);

    expect(member.received).toHaveLength(1);
  });

  it('delivers a self-membership in an unregistered org through the user channel', async () => {
    // Connected as a member of orgA only, so the new-org invite can arrive only via the user
    // channel. The bystander shares the org channel but must not receive that event.
    const joiner = fakeSubscriber([membership(orgA, memberRole, 'joiner-user')], 'joiner-user', [orgA], orgA);
    const bystander = fakeSubscriber([membership(orgA, memberRole, 'bystander-user')], 'bystander-user', [orgA], orgA);
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
      organizationId: orgB,
      rowData: { id: 'mem-new-org', userId: 'joiner-user', channelType: 'organization', channelId: orgB, organizationId: orgB, role: memberRole },
      rows: null,
      trace: null,
      stx: null,
    } as unknown as ActivityEvent;

    await dispatchToAppStream(membershipEvent as AppStreamEvent);

    expect(joiner.received).toHaveLength(1);
    expect(joiner.received[0]).toMatchObject({ kind: 'membership', action: 'create', seq: null, batchUntilSeq: null, count: null });
    expect(bystander.received).toHaveLength(0);
  });

  it('does not ping anyone for an event with no readable rows', async () => {
    const { subscriber, received } = fakeSubscriber([membership(orgA, memberRole, 'moved-user')], 'moved-user', [orgA, orgB], orgB);
    streamSubscriberManager.register(subscriber);

    await dispatchToAppStream(
      attachmentEvent(orgB, [
        { seq: 30, rowData: attachmentRow('attachment-a', orgB) },
        { seq: 31, rowData: attachmentRow('attachment-b', orgB) },
      ]) as AppStreamEvent,
    );

    expect(received).toHaveLength(0);
  });
});
