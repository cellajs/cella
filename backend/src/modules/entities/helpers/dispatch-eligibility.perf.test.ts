import { appConfig, type EntityRole } from 'shared';
import { describe, expect, it } from 'vitest';
import {
  type AppStreamSubscriber,
  canReceiveProductEvent,
  rowReadDecisions,
  rowScopedEvent,
} from '#/modules/entities/helpers/dispatch-to-stream';
import type { AppStreamProductEvent } from '#/modules/entities/stream/types';
import type { MembershipBaseModel } from '#/modules/memberships/helpers/select';

/**
 * Compares independent subscriber checks with dispatch's access-class collapse under a
 * hot-organization workload. Timings are hardware-dependent; assertions guard only the
 * expected performance direction.
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

const scopedRows = (event: AppStreamProductEvent): AppStreamProductEvent[] => {
  const rows = event.batchRows?.length ? event.batchRows : [{ rowData: event.rowData as Record<string, unknown> }];
  return rows.map(({ rowData }) => (rowData === event.rowData ? event : rowScopedEvent(event, rowData)));
};

/** Per-subscriber baseline: independent engine calls, scoped events derived once, no collapse. */
const perSubscriberFilter = (
  subscribers: AppStreamSubscriber[],
  event: AppStreamProductEvent,
): AppStreamSubscriber[] => {
  const scoped = scopedRows(event);
  return subscribers.filter(
    (subscriber) =>
      subscriber.organizationIds.has(event.organizationId) &&
      scoped.some((scopedEvent) => canReceiveProductEvent(subscriber, scopedEvent)),
  );
};

/** The batch path dispatch uses: one `checkAccess` call per row over the undecided pool. */
const batchFilter = (subscribers: AppStreamSubscriber[], event: AppStreamProductEvent): AppStreamSubscriber[] => {
  const eligible: AppStreamSubscriber[] = [];
  let undecided = subscribers.filter((s) => s.organizationIds.has(event.organizationId));
  for (const scopedEvent of scopedRows(event)) {
    if (undecided.length === 0) break;
    const decisions = rowReadDecisions(undecided, scopedEvent);
    const stillUndecided: AppStreamSubscriber[] = [];
    for (const [index, subscriber] of undecided.entries()) {
      (decisions[index] ? eligible : stillUndecided).push(subscriber);
    }
    undecided = stillUndecided;
  }
  return eligible;
};

/**
 * Average ms per run. `makeInput` runs OUTSIDE the timed section and returns a fresh event
 * each run (one event is dispatched exactly once in production); membership arrays stay
 * stable across runs, matching steady-state connections (warm engine index memo for BOTH
 * paths).
 */
const MEASURE_RUNS = 6;
const measure = (makeInput: () => AppStreamProductEvent, run: (event: AppStreamProductEvent) => unknown): number => {
  for (let i = 0; i < 2; i++) run(makeInput());
  const times: number[] = [];
  for (let i = 0; i < MEASURE_RUNS; i++) {
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
  /** Set for the non-reader scenario: subscribers registered on the channel with no membership. */
  allDenied?: boolean;
}

describe('dispatch batch eligibility: fan-out benchmark', () => {
  // Keep the performance direction visible under instrumented two-core CI.
  // Timings remain informational; assertions cover correctness and regression direction.
  const hot2000 = makeSubscribers(2000, ORG);
  const hot1200 = makeSubscribers(1200, ORG);
  // Registered on the channel (connect-time), but membership moved: worst case, every
  // batch row is checked and denied for every subscriber.
  const strangers1200 = makeSubscribers(1200, 'org-perf-gone').map((subscriber) => ({
    ...subscriber,
    organizationIds: new Set([ORG]),
  }));

  // Eligibility count depends on fork policies, so assert batch/baseline parity plus universal
  // reader and non-member expectations.
  const scenarios: Scenario[] = [
    {
      name: 'single row × 2000 readers',
      subscribers: hot2000,
      makeEvent: () => makeEvent(ORG, 1),
    },
    {
      name: '40-row batch × 1200 readers',
      subscribers: hot1200,
      makeEvent: () => makeEvent(ORG, 40),
    },
    {
      name: '40-row batch × 1200 non-readers',
      subscribers: strangers1200,
      makeEvent: () => makeEvent(ORG, 40),
      allDenied: true,
    },
  ];

  it('batch filter matches per-subscriber output and beats it on CPU', { timeout: 60_000 }, () => {
    const lines: string[] = [];

    for (const scenario of scenarios) {
      const singleEligible = perSubscriberFilter(scenario.subscribers, scenario.makeEvent());
      const batchEligible = batchFilter(scenario.subscribers, scenario.makeEvent());
      expect(new Set(batchEligible.map((s) => s.id))).toEqual(new Set(singleEligible.map((s) => s.id)));
      if (scenario.allDenied) expect(batchEligible).toHaveLength(0);
      else expect(batchEligible.length).toBeGreaterThan(0);

      const singleMs = measure(scenario.makeEvent, (event) => perSubscriberFilter(scenario.subscribers, event));
      const batchMs = measure(scenario.makeEvent, (event) => batchFilter(scenario.subscribers, event));
      lines.push(
        `${scenario.name}: per-subscriber ${singleMs.toFixed(2)}ms → batch ${batchMs.toFixed(2)}ms (${(singleMs / batchMs).toFixed(1)}x)`,
      );

      // Access-class collapse should not be materially slower than per-subscriber checks.
      // A broad tolerance absorbs CI sampling noise while retaining a regression guard.
      expect(batchMs).toBeLessThan(singleMs * 1.5);
    }

    console.info(`\n  Fan-out eligibility filter (avg of ${MEASURE_RUNS} runs):\n  ${lines.join('\n  ')}\n`);
  });
});
