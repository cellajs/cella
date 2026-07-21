import { appConfig, type EntityRole } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  canReceiveProductEvent,
  rowReadDecisions,
  rowScopedEvent,
  type SubscriberAccess,
} from '#/modules/entities/helpers/dispatch-to-stream';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * The batch eligibility path (`rowReadDecisions`, engine-side access-class collapse) must
 * agree with the single-subscriber predicate (`canReceiveProductEvent`, a batch of one) on
 * every (subscriber, row). The engine's own class-key guarantee is property-tested in
 * shared (`resolve-access.test.ts`) with synthetic policies; these tests pin the dispatch
 * wiring: veto propagation, per-row any-of composition, and per-subscriber isolation.
 */
const ORGS = ['org-el-a', 'org-el-b', 'org-el-c'];
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
    id: 'activity-eligibility',
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

const scopedRows = (event: AppStreamProductEvent): AppStreamProductEvent[] => {
  const rows = event.batchRows?.length ? event.batchRows : [{ rowData: event.rowData as Record<string, unknown> }];
  return rows.map(({ rowData }) => (rowData === event.rowData ? event : rowScopedEvent(event, rowData)));
};

/** The dispatch any-of composition over batch rows, order-preserving, as selectEligible does. */
const batchDecisions = (subscribers: SubscriberAccess[], event: AppStreamProductEvent): boolean[] => {
  const results = subscribers.map(() => false);
  let undecided = subscribers.map((_, index) => index);
  for (const scopedEvent of scopedRows(event)) {
    if (undecided.length === 0) break;
    const decisions = rowReadDecisions(
      undecided.map((index) => subscribers[index]),
      scopedEvent,
    );
    undecided = undecided.filter((subscriberIndex, position) => {
      if (decisions[position]) {
        results[subscriberIndex] = true;
        return false;
      }
      return true;
    });
  }
  return results;
};

/** The per-subscriber evaluation: independent batch-of-1 checks, no cross-subscriber sharing. */
const singleDecision = (subscriber: SubscriberAccess, event: AppStreamProductEvent): boolean =>
  scopedRows(event).some((scopedEvent) => canReceiveProductEvent(subscriber, scopedEvent));

describe('dispatch batch eligibility: deterministic splits', () => {
  it('a malformed membership denies its holder without poisoning others in the SAME batch call', () => {
    const event = attachmentEvent(ORGS[0], { rowData: attachmentRow('att-1', ORGS[0]) });

    const clean: SubscriberAccess = {
      userId: 'user-1',
      isSystemAdmin: false,
      memberships: [membership(ORGS[0], 'member', 'user-1')],
    };
    // Same granting membership PLUS a malformed one: the engine fail-closes just this access.
    const broken: SubscriberAccess = {
      userId: 'user-2',
      isSystemAdmin: false,
      memberships: [membership(ORGS[0], 'member', 'user-2'), membership(ORGS[1], 'member', 'user-2', true)],
    };

    // broken FIRST: were classes shared naively, its deny would leak onto clean.
    expect(batchDecisions([broken, clean], event)).toEqual([false, true]);
    expect(singleDecision(clean, event)).toBe(true);
    expect(singleDecision(broken, event)).toBe(false);
  });

  it('system admin and memberless subscriber resolve differently in one batch', () => {
    const event = attachmentEvent(ORGS[0], { rowData: attachmentRow('att-2', ORGS[0]) });

    const admin: SubscriberAccess = { userId: 'user-1', isSystemAdmin: true, memberships: [] };
    const nobody: SubscriberAccess = { userId: 'user-2', isSystemAdmin: false, memberships: [] };

    expect(batchDecisions([admin, nobody], event)).toEqual([true, false]);
  });

  it('draft rows deny every subscriber, author and admin included', () => {
    const event = attachmentEvent(ORGS[0], {
      rowData: attachmentRow('att-draft', ORGS[0], { createdBy: 'user-1', publishedAt: null }),
    });

    const author: SubscriberAccess = {
      userId: 'user-1',
      isSystemAdmin: false,
      memberships: [membership(ORGS[0], 'member', 'user-1')],
    };
    const admin: SubscriberAccess = { userId: 'user-2', isSystemAdmin: true, memberships: [] };

    expect(batchDecisions([author, admin], event)).toEqual([false, false]);
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

    expect(batchDecisions([orgAMember, orgCMember], event)).toEqual([true, false]);
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
  it('batch decision === independent single decision for every subscriber, across 300 random events', () => {
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

      const batch = batchDecisions(subscribers, event);
      for (const [index, subscriber] of subscribers.entries()) {
        expect(batch[index], `seed=0x${SEED.toString(16)} iteration=${iteration} subscriber=${index}`).toBe(
          singleDecision(subscriber, event),
        );
      }
    }
  });
});
