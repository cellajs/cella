import { appConfig, type ChannelEntityType, type EntityRole } from 'shared';
import { describe, expect, it } from 'vitest';
import { configurePolicyMatrix } from '../../testing/policies';
import { getAllDecisions } from './check';
import type { SubjectForPermission } from './types';

/** Minimal test membership matching MembershipBaseModel structure */
type TestMembership = {
  id: string;
  tenantId: string;
  channelType: ChannelEntityType;
  channelId: string;
  userId: string;
  role: EntityRole;
  displayOrder: number;
  muted: boolean;
  archived: boolean;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
};

const policies = configurePolicyMatrix(appConfig.entityTypes, ({ entityType, channels }) => {
  switch (entityType) {
    case 'organization':
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'attachment':
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
      break;
  }
});

const createMemberships = (count: number): TestMembership[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `mem${i}`,
    tenantId: 'test01',
    channelType: 'organization' as const,
    channelId: `org${i}`,
    userId: `user${i}`,
    organizationId: `org${i}`,
    role: i % 3 === 0 ? ('admin' as const) : ('member' as const),
    displayOrder: 0,
    muted: false,
    archived: false,
    workspaceId: null,
    projectId: null,
  }));

const createSubjects = (count: number): SubjectForPermission[] =>
  Array.from({ length: count }, (_, i) => ({
    entityType: 'attachment' as const,
    id: `attachment${i}`,
    channelIds: { organization: `org${i % 20}` },
  }));

/** Run function multiple times and return average execution time in ms */
const measureAverage = (fn: () => void, runs = 10): number => {
  // Warmup
  for (let i = 0; i < 3; i++) fn();

  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const start = performance.now();
    fn();
    times.push(performance.now() - start);
  }

  return times.reduce((a, b) => a + b, 0) / times.length;
};

// Array checks stay under 10ms; repeated single checks on a stable array reuse the memoized
// membership index (the dispatch fan-out path), so they must beat fresh-array checks (avg of 10 runs).
describe('Permission batch performance', () => {
  const memberships = createMemberships(50);
  const subjects = createSubjects(100);

  it('checking 100 entities (array) should complete in < 10ms (avg of 10 runs)', () => {
    const avgTime = measureAverage(() => {
      getAllDecisions(policies, memberships, subjects);
    });

    console.info(`  Array of 100 entities: ${avgTime.toFixed(2)}ms average`);

    // Absolute threshold: should be fast enough for real-time use
    expect(avgTime).toBeLessThan(10);
  });

  it('repeated single checks on a stable array reuse the membership index (memoized)', () => {
    // Warm: the SAME array every call (dispatch subscriber / repeated API reads) → index built
    // once by the memo, then reused.
    const warmTime = measureAverage(() => {
      for (const subject of subjects) getAllDecisions(policies, memberships, subject);
    });

    // Cold: a FRESH array every call → memo miss, index rebuilt each time.
    const coldTime = measureAverage(() => {
      for (const subject of subjects) getAllDecisions(policies, createMemberships(50), subject);
    });

    const speedup = coldTime / warmTime;
    console.info(`  Warm (stable array): ${warmTime.toFixed(2)}ms, Cold (fresh array/call): ${coldTime.toFixed(2)}ms (${speedup.toFixed(1)}x)`);

    // Reusing a stable array must be meaningfully faster than rebuilding the index every call.
    expect(speedup).toBeGreaterThan(1.5);
  });
});
