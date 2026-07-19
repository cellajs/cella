import { appConfig, type EntityRole } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  canReceiveEntityEvent,
  canReceiveEntityEventCached,
  rowScopedEvent,
  type SubscriberAccess,
} from '#/modules/entities/helpers/dispatch-to-stream';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * The class memo must be a pure cache: for every (subscriber, row) the memoized decision
 * equals the direct engine decision. The risk surface is the class KEY — a key too coarse
 * silently shares a decision between subscribers the engine would treat differently.
 * Deterministic cases pin the known splitting dimensions (admin bit, owner bit, malformed
 * memberships); the seeded sweep hunts for unknown ones.
 */

const ORGS = ['org-cm-a', 'org-cm-b', 'org-cm-c'];
const USERS = ['user-1', 'user-2', 'user-3', 'user-4', 'user-5'];

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

const attachmentEvent = (organizationId: string, overrides: Record<string, unknown>): AppStreamProductEvent =>
  ({
    id: 'activity-classmemo',
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
    seq: 1,
    batchUntilSeq: null,
    propagation: null,
    trace: null,
    stx: null,
    ...overrides,
  }) as unknown as AppStreamProductEvent;

/** The pre-memo per-subscriber evaluation, verbatim: scoped event derived inside the loop. */
const legacyDecision = (subscriber: SubscriberAccess, event: AppStreamProductEvent): boolean => {
  const rows = event.batchRows?.length ? event.batchRows : [{ rowData: event.rowData as Record<string, unknown> }];
  return rows.some(({ rowData }) =>
    canReceiveEntityEvent(subscriber, rowData === event.rowData ? event : rowScopedEvent(event, rowData)),
  );
};

/** The memoized evaluation with scoped events hoisted and SHARED across subscribers, as dispatch now does. */
const memoizedDecider = (event: AppStreamProductEvent): ((subscriber: SubscriberAccess) => boolean) => {
  const rows = event.batchRows?.length ? event.batchRows : [{ rowData: event.rowData as Record<string, unknown> }];
  const scoped = rows.map(({ rowData }) => (rowData === event.rowData ? event : rowScopedEvent(event, rowData)));
  return (subscriber) => scoped.some((scopedEvent) => canReceiveEntityEventCached(subscriber, scopedEvent));
};

describe('dispatch class memo: deterministic splits', () => {
  it('a malformed membership denies its holder without poisoning the clean subscriber sharing the row', () => {
    const event = attachmentEvent(ORGS[0], { rowData: attachmentRow('att-1', ORGS[0]) });
    const decide = memoizedDecider(event);

    const clean: SubscriberAccess = {
      userId: 'user-1',
      isSystemAdmin: false,
      memberships: [membership(ORGS[0], 'member', 'user-1')],
    };
    // Same granting membership PLUS a malformed one: the engine fails the whole check on it.
    const broken: SubscriberAccess = {
      userId: 'user-2',
      isSystemAdmin: false,
      memberships: [membership(ORGS[0], 'member', 'user-2'), membership(ORGS[1], 'member', 'user-2', true)],
    };

    // Order matters for the poison scenario: evaluate broken FIRST so a shared class would
    // cache its deny and wrongly deny the clean subscriber (and vice versa on second pass).
    expect(decide(broken)).toBe(false);
    expect(decide(clean)).toBe(true);
    expect(decide(broken)).toBe(false);

    expect(legacyDecision(clean, event)).toBe(true);
    expect(legacyDecision(broken, event)).toBe(false);
  });

  it('system admin and memberless subscriber never share a class', () => {
    const event = attachmentEvent(ORGS[0], { rowData: attachmentRow('att-2', ORGS[0]) });
    const decide = memoizedDecider(event);

    const admin: SubscriberAccess = { userId: 'user-1', isSystemAdmin: true, memberships: [] };
    const nobody: SubscriberAccess = { userId: 'user-2', isSystemAdmin: false, memberships: [] };

    expect(decide(admin)).toBe(true);
    expect(decide(nobody)).toBe(false);
    expect(decide(admin)).toBe(legacyDecision(admin, event));
    expect(decide(nobody)).toBe(legacyDecision(nobody, event));
  });

  it('draft rows deny every class, author and admin included', () => {
    const event = attachmentEvent(ORGS[0], {
      rowData: attachmentRow('att-draft', ORGS[0], { createdBy: 'user-1', publishedAt: null }),
    });
    const decide = memoizedDecider(event);

    const author: SubscriberAccess = {
      userId: 'user-1',
      isSystemAdmin: false,
      memberships: [membership(ORGS[0], 'member', 'user-1')],
    };
    const admin: SubscriberAccess = { userId: 'user-2', isSystemAdmin: true, memberships: [] };

    for (const subscriber of [author, admin]) {
      expect(decide(subscriber)).toBe(false);
      expect(decide(subscriber)).toBe(legacyDecision(subscriber, event));
    }
  });

  it('batch rows: readable non-representative row still reaches only its readers', () => {
    const event = attachmentEvent(ORGS[1], {
      batchUntilSeq: 2,
      rowData: attachmentRow('att-a', ORGS[1]),
      batchRows: [
        { seq: 1, rowData: attachmentRow('att-a', ORGS[1]) },
        { seq: 2, rowData: attachmentRow('att-b', ORGS[0]) },
      ],
    });
    const decide = memoizedDecider(event);

    const orgAMember: SubscriberAccess = {
      userId: 'user-1',
      isSystemAdmin: false,
      memberships: [membership(ORGS[0], 'member', 'user-1')],
    };
    const orgCMember: SubscriberAccess = {
      userId: 'user-2',
      isSystemAdmin: false,
      memberships: [membership(ORGS[2], 'member', 'user-2')],
    };

    expect(decide(orgAMember)).toBe(true);
    expect(decide(orgCMember)).toBe(false);
    expect(decide(orgAMember)).toBe(legacyDecision(orgAMember, event));
    expect(decide(orgCMember)).toBe(legacyDecision(orgCMember, event));
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

describe('dispatch class memo: randomized parity sweep', () => {
  it('memoized decision === direct engine decision for every subscriber, across 300 random events', () => {
    const SEED = 0xce11a;
    const random = mulberry32(SEED);
    const pick = <T>(items: T[]): T => items[Math.floor(random() * items.length)];
    const roles: EntityRole[] = ['admin', 'member'] as EntityRole[];

    for (let iteration = 0; iteration < 300; iteration++) {
      const eventOrg = pick(ORGS);
      const rowCount = 1 + Math.floor(random() * 4);
      const rows = Array.from({ length: rowCount }, (_, i) =>
        attachmentRow(`att-${iteration}-${i}`, random() < 0.7 ? eventOrg : pick(ORGS), {
          createdBy: random() < 0.2 ? null : pick(USERS),
          ...(random() < 0.15 ? { publishedAt: null } : random() < 0.3 ? { publishedAt: '2026-07-01T00:00:00Z' } : {}),
        }),
      );
      const event = attachmentEvent(eventOrg, {
        rowData: rows[0],
        ...(rowCount > 1 && {
          batchUntilSeq: rowCount,
          batchRows: rows.map((rowData, i) => ({ seq: i + 1, rowData })),
        }),
      });

      const subscribers: SubscriberAccess[] = Array.from({ length: 60 }, () => {
        const userId = pick(USERS);
        const membershipCount = Math.floor(random() * 4);
        return {
          userId,
          isSystemAdmin: random() < 0.05,
          memberships: Array.from({ length: membershipCount }, () =>
            membership(pick(ORGS), pick(roles), userId, random() < 0.05),
          ),
        };
      });

      const decide = memoizedDecider(event);
      // Two passes: the first fills the memo, the second must serve identical hits.
      for (let pass = 0; pass < 2; pass++) {
        for (const [index, subscriber] of subscribers.entries()) {
          const direct = legacyDecision(subscriber, event);
          const memoized = decide(subscriber);
          expect(memoized, `seed=0x${SEED.toString(16)} iteration=${iteration} subscriber=${index} pass=${pass}`).toBe(
            direct,
          );
        }
      }
    }
  });
});
