import { appConfig, type EntityRole } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  type AppStreamSubscriber,
  canReceiveEntityEvent,
  canReceiveEntityEventCached,
  rowScopedEvent,
} from '#/modules/entities/helpers/dispatch-to-stream';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * Dispatch-shaped benchmark for the per-event class memo, sized after the measured
 * constraint in .todos/SYNC_FANOUT_OPTIMIZATION.md: one busy org, thousands of
 * subscribers on `org:<id>`, single-row and CDC-collapsed batch events. Compares the
 * pre-memo eligibility filter (per-subscriber engine checks, scoped events derived
 * inside the loop) against the memoized filter (row contexts hoisted, one engine call
 * per access class). Absolute numbers are hardware-dependent; the printed table is the
 * deliverable, the assertions only guard the direction.
 */

const ORG = 'org-perf-hot';
const OTHER_ORGS = ['org-perf-b', 'org-perf-c'];

const nullAncestorScopes = Object.fromEntries(
  appConfig.channelEntityTypes
    .filter((channelType) => channelType !== 'organization')
    .map((channelType) => [appConfig.entityIdColumnKeys[channelType], null]),
);

const membership = (organizationId: string, role: EntityRole, userId: string): MembershipBaseModel =>
  ({
    id: `mem-${organizationId}-${userId}`,
    userId,
    channelType: 'organization',
    channelId: organizationId,
    organizationId,
    role,
  }) as unknown as MembershipBaseModel;

/** N subscribers of the hot org (90% member / 10% admin), each also in two quiet orgs. */
const makeSubscribers = (count: number, organizationId: string): AppStreamSubscriber[] =>
  Array.from({ length: count }, (_, i) => {
    const userId = `user-${i}`;
    const role: EntityRole = (i % 10 === 0 ? 'admin' : 'member') as EntityRole;
    return {
      id: `sub-${i}`,
      channel: `org:${organizationId}`,
      stream: null as never,
      userId,
      organizationIds: new Set([organizationId, ...OTHER_ORGS]),
      isSystemAdmin: false,
      memberships: [
        membership(organizationId, role, userId),
        membership(OTHER_ORGS[0], 'member' as EntityRole, userId),
        membership(OTHER_ORGS[1], 'member' as EntityRole, userId),
      ],
      cursor: null,
    };
  });

const attachmentRow = (id: string, organizationId: string) => ({
  id,
  organizationId,
  ...nullAncestorScopes,
  createdBy: `author-${id}`,
  publishedAt: '2026-07-01T00:00:00Z',
});

const makeEvent = (organizationId: string, rowCount: number): AppStreamProductEvent => {
  const rows = Array.from({ length: rowCount }, (_, i) => attachmentRow(`att-${i}`, organizationId));
  return {
    id: 'activity-perf',
    type: 'attachment.created',
    action: 'create',
    entityType: 'attachment',
    resourceType: null,
    tableName: 'attachments',
    subjectId: rows[0].id,
    tenantId: 'tenant-1',
    organizationId,
    ...nullAncestorScopes,
    rowData: rows[0],
    seq: 1,
    batchUntilSeq: rowCount > 1 ? rowCount : null,
    ...(rowCount > 1 && { batchRows: rows.map((rowData, i) => ({ seq: i + 1, rowData })) }),
    propagation: null,
    trace: null,
    stx: null,
  } as unknown as AppStreamProductEvent;
};

const eventRows = (event: AppStreamProductEvent) =>
  event.batchRows?.length ? event.batchRows : [{ rowData: event.rowData as Record<string, unknown> }];

/** The pre-memo filter, verbatim old shouldReceive: scoped events rebuilt per subscriber. */
const legacyFilter = (subscribers: AppStreamSubscriber[], event: AppStreamProductEvent): AppStreamSubscriber[] =>
  subscribers.filter(
    (subscriber) =>
      subscriber.organizationIds.has(event.organizationId) &&
      eventRows(event).some(({ rowData }) =>
        canReceiveEntityEvent(subscriber, rowData === event.rowData ? event : rowScopedEvent(event, rowData)),
      ),
  );

/** The memoized filter: scoped events hoisted once per event, decisions served per access class. */
const memoFilter = (subscribers: AppStreamSubscriber[], event: AppStreamProductEvent): AppStreamSubscriber[] => {
  const scoped = eventRows(event).map(({ rowData }) =>
    rowData === event.rowData ? event : rowScopedEvent(event, rowData),
  );
  return subscribers.filter(
    (subscriber) =>
      subscriber.organizationIds.has(event.organizationId) &&
      scoped.some((scopedEvent) => canReceiveEntityEventCached(subscriber, scopedEvent)),
  );
};

/**
 * Average ms per run. `makeInput` runs OUTSIDE the timed section and returns a fresh
 * event each run, so the per-event memo starts cold every measured iteration (one event
 * is dispatched exactly once in production); membership arrays stay stable across runs,
 * matching steady-state connections (warm engine index memo for BOTH paths).
 */
const measure = (makeInput: () => AppStreamProductEvent, run: (event: AppStreamProductEvent) => unknown): number => {
  for (let i = 0; i < 3; i++) run(makeInput());
  const times: number[] = [];
  for (let i = 0; i < 15; i++) {
    const event = makeInput();
    const start = performance.now();
    run(event);
    times.push(performance.now() - start);
  }
  return times.reduce((a, b) => a + b, 0) / times.length;
};

interface Scenario {
  name: string;
  subscribers: AppStreamSubscriber[];
  makeEvent: () => AppStreamProductEvent;
  expectedEligible: number;
}

describe('dispatch class memo: fan-out benchmark', () => {
  const hot5000 = makeSubscribers(5000, ORG);
  const hot3000 = makeSubscribers(3000, ORG);
  // Registered on the channel (connect-time), but membership moved: worst case, every
  // batch row is checked and denied for every subscriber.
  const strangers3000 = makeSubscribers(3000, 'org-perf-gone').map((subscriber) => ({
    ...subscriber,
    organizationIds: new Set([ORG]),
  }));

  const scenarios: Scenario[] = [
    {
      name: 'single row × 5000 readers',
      subscribers: hot5000,
      makeEvent: () => makeEvent(ORG, 1),
      expectedEligible: 5000,
    },
    {
      name: '200-row batch × 3000 readers',
      subscribers: hot3000,
      makeEvent: () => makeEvent(ORG, 200),
      expectedEligible: 3000,
    },
    {
      name: '200-row batch × 3000 non-readers',
      subscribers: strangers3000,
      makeEvent: () => makeEvent(ORG, 200),
      expectedEligible: 0,
    },
  ];

  it('memoized filter matches legacy output and beats it on CPU', () => {
    const lines: string[] = [];

    for (const scenario of scenarios) {
      const legacyEligible = legacyFilter(scenario.subscribers, scenario.makeEvent());
      const memoEligible = memoFilter(scenario.subscribers, scenario.makeEvent());
      expect(memoEligible.map((s) => s.id)).toEqual(legacyEligible.map((s) => s.id));
      expect(memoEligible).toHaveLength(scenario.expectedEligible);

      const legacyMs = measure(scenario.makeEvent, (event) => legacyFilter(scenario.subscribers, event));
      const memoMs = measure(scenario.makeEvent, (event) => memoFilter(scenario.subscribers, event));
      lines.push(
        `${scenario.name}: legacy ${legacyMs.toFixed(2)}ms → memo ${memoMs.toFixed(2)}ms (${(legacyMs / memoMs).toFixed(1)}x)`,
      );

      // Direction guard only — loose enough to survive CI noise.
      expect(memoMs).toBeLessThan(legacyMs);
    }

    console.info(`\n  Fan-out eligibility filter (avg of 15 runs, cold memo per event):\n  ${lines.join('\n  ')}\n`);
  });
});
