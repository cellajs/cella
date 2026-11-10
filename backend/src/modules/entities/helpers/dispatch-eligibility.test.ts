import { type Access, appConfig, type EntityActionType, type EntityRole, type SubjectForPermission } from 'shared';
import { describe, expect, it, vi } from 'vitest';
import { canReceiveProductEvent, readerFrames, type SubscriberAccess } from '#/modules/entities/helpers/dispatch-to-stream';
import type { StreamProductEvent } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';
import { memberRole } from '../../../../tests/fixtures';

// The template reads no row by `own`: here the least privileged organization role reads only the attachments it wrote,
// so the sweep reaches the decision `readerFrames` takes again for a row's author.
vi.mock('shared', async (importOriginal) => {
  const shared = await importOriginal<typeof import('shared')>();
  const { appConfig, hierarchy, publicReadGrants } = shared;
  const { configurePolicyMatrix } = await import('shared/testing/policies');
  const { getDecisionsForAccesses } = await import('shared/permissions/engine/resolve-access');
  const policies = configurePolicyMatrix(appConfig.entityTypes, ({ entityType, channels }) => {
    if (entityType !== 'attachment') return;
    channels.organization[hierarchy.getMostPrivilegedRole('organization')]({ read: 1 });
    channels.organization[hierarchy.getLeastPrivilegedRole('organization')]({ read: 'own' });
  });
  const checkAccessFanout = (accesses: Access[], action: EntityActionType, subject: SubjectForPermission) =>
    getDecisionsForAccesses(
      policies,
      accesses.map((access) => ('anonymous' in access ? { memberships: [] } : access)),
      subject,
      // Cella grants no public read on attachments, so the sweep's public bit pins a decision only with one granted here.
      { publicGrants: { ...publicReadGrants, attachment: true } },
    ).map((can) => can[action]);
  return { ...shared, checkAccessFanout };
});

/**
 * `readerFrames` must agree with `canReceiveProductEvent` on every (subscriber, row): veto
 * propagation, rows decided once for alike ones, and per-subscriber isolation.
 */
const orgs = ['org-el-a', 'org-el-b', 'org-el-c'];
const users = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];

const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

const membership = (organizationId: string, role: EntityRole, userId: string, malformed = false): MembershipBaseModel =>
  ({
    id: `mem-${organizationId}-${role}-${userId}`,
    userId,
    channelType: 'organization',
    channelId: malformed ? '' : organizationId,
    organizationId,
    role,
  }) as unknown as MembershipBaseModel;

const attachmentRow = (id: string, organizationId: string, extra: Record<string, unknown> = {}) => ({
  id,
  organizationId,
  ...nullAncestorScopes,
  createdBy: 'author-user',
  ...extra,
});

/** A product event as the bus delivers it: its rows, each with the activity of its write and its permission fields. */
const attachmentEvent = (organizationId: string, rows: Record<string, unknown>[]): StreamProductEvent =>
  // A fixture: the cast covers the widened `type` string and the untyped channel columns `nullAncestorScopes` spreads.
  ({
    type: 'attachment.created',
    action: 'create',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    tenantId: 'tenant-1',
    organizationId,
    ...nullAncestorScopes,
    rowData: null,
    rows: rows.map((rowData, index) => ({ activityId: `act-${index}`, actorId: null, changedFields: null, stx: null, seq: index + 1, rowData })),
    trace: null,
  }) as unknown as StreamProductEvent;

/** The rows the dispatch names to each subscriber, in their order; none for a subscriber in no frame. */
const batchRows = (subscribers: SubscriberAccess[], event: StreamProductEvent) => {
  const named = new Map<SubscriberAccess, StreamProductEvent['rows']>();
  for (const { rows, readers } of readerFrames(subscribers, event)) for (const reader of readers) named.set(reader, rows);
  return subscribers.map((subscriber) => named.get(subscriber) ?? []);
};

/** Whether the dispatch names any row of the event to each subscriber. */
const batchDecisions = (subscribers: SubscriberAccess[], event: StreamProductEvent): boolean[] =>
  batchRows(subscribers, event).map((rows) => rows.length > 0);

/** The per-subscriber evaluation: independent batch-of-1 checks, no cross-subscriber sharing. */
const singleRows = (subscriber: SubscriberAccess, event: StreamProductEvent) =>
  event.rows.filter(({ rowData }) => canReceiveProductEvent(subscriber, event, rowData));

describe('dispatch batch eligibility: deterministic splits', () => {
  it('a malformed membership denies its holder without poisoning others in the SAME batch call', () => {
    // Org members hold read:'own': the row must be authored by the reader to be readable.
    const event = attachmentEvent(orgs[0], [attachmentRow('att-1', orgs[0], { createdBy: 'user-1' })]);

    const clean: SubscriberAccess = { userId: 'user-1', isSystemAdmin: false, memberships: [membership(orgs[0], memberRole, 'user-1')] };
    // A granting membership plus a malformed one: the engine fail-closes just this access.
    const broken: SubscriberAccess = {
      userId: 'user-2',
      isSystemAdmin: false,
      memberships: [membership(orgs[0], memberRole, 'user-2'), membership(orgs[1], memberRole, 'user-2', true)],
    };

    // broken comes first: were classes shared naively, its deny would leak onto clean.
    expect(batchDecisions([broken, clean], event)).toEqual([false, true]);
    expect(singleRows(clean, event)).toHaveLength(1);
    expect(singleRows(broken, event)).toEqual([]);
  });

  it('system admin and memberless subscriber resolve differently in one batch', () => {
    const event = attachmentEvent(orgs[0], [attachmentRow('att-2', orgs[0])]);

    const admin: SubscriberAccess = { userId: 'user-1', isSystemAdmin: true, memberships: [] };
    const nobody: SubscriberAccess = { userId: 'user-2', isSystemAdmin: false, memberships: [] };

    expect(batchDecisions([admin, nobody], event)).toEqual([true, false]);
  });
});

/** Deterministic PRNG so a failure reproduces from the printed seed. */
const mulberry32 = (seed: number) => {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('dispatch batch eligibility: randomized parity sweep', () => {
  it('the rows a batch names === the rows independent single decisions allow, for every subscriber, across 300 random events', () => {
    const SEED = 0xce11a;
    const random = mulberry32(SEED);
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
    const roles: EntityRole[] = ['admin', memberRole];

    for (let iteration = 0; iteration < 300; iteration++) {
      const eventOrg = pick(orgs);
      const rowCount = 1 + Math.floor(random() * 4);
      const rows = Array.from({ length: rowCount }, (_, i) =>
        attachmentRow(`att-${iteration}-${i}`, random() < 0.7 ? eventOrg : pick(orgs), {
          createdBy: random() < 0.2 ? null : pick(users),
          public: random() < 0.3,
          ...(random() < 0.15 ? { publishedAt: null } : random() < 0.3 ? { publishedAt: '2026-07-01T00:00:00Z' } : {}),
        }),
      );
      const event = attachmentEvent(eventOrg, rows);

      const subscribers: SubscriberAccess[] = Array.from({ length: 60 }, () => {
        const userId = pick(users);
        const membershipCount = Math.floor(random() * 4);
        return {
          userId,
          isSystemAdmin: random() < 0.05,
          memberships: Array.from({ length: membershipCount }, () => membership(pick(orgs), pick(roles), userId, random() < 0.05)),
        };
      });

      const batch = batchRows(subscribers, event);
      for (const [index, subscriber] of subscribers.entries()) {
        expect(batch[index], `seed=0x${SEED.toString(16)} iteration=${iteration} subscriber=${index}`).toEqual(singleRows(subscriber, event));
      }
    }
  });
});
