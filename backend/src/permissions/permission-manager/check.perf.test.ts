import { appConfig, type ContextEntityType, configureAccessPolicies, type EntityRole } from 'shared';
import { describe, expect, it } from 'vitest';
import { getAllDecisions } from './check';
import type { SubjectForPermission } from './types';

/** Minimal test membership matching MembershipBaseModel structure */
type TestMembership = {
  id: string;
  tenantId: string;
  contextType: ContextEntityType;
  userId: string;
  role: EntityRole;
  displayOrder: number;
  muted: boolean;
  archived: boolean;
  organizationId: string;
  workspaceId: string | null;
  projectId: string | null;
};

/**
 * Performance regression tests for permission checking.
 *
 * Tests two aspects:
 * 1. Absolute performance: checking 100 entities should complete in < 10ms
 * 2. Relative performance: array input should be at least 2x faster than looping single calls
 *
 * Uses 10 runs with average to reduce variance from system load.
 */

// Setup: Configure policies
const policies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
  switch (subject.name) {
    case 'organization':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
      contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0, search: 1 });
      break;
    case 'attachment':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0, search: 1 });
      break;
    case 'page':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 1, delete: 0, search: 1 });
      break;
  }
});

// Helper to create memberships
const createMemberships = (count: number): TestMembership[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `mem${i}`,
    tenantId: 'test01',
    contextType: 'organization' as const,
    userId: `user${i}`,
    organizationId: `org${i}`,
    role: i % 3 === 0 ? ('admin' as const) : ('member' as const),
    displayOrder: 0,
    muted: false,
    archived: false,
    workspaceId: null,
    projectId: null,
  }));

// Helper to create subjects
const createSubjects = (count: number): SubjectForPermission[] =>
  Array.from({ length: count }, (_, i) => ({
    entityType: 'attachment' as const,
    id: `attachment${i}`,
    organizationId: `org${i % 20}`,
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

  it('array input should be at least 2x faster than loop of single calls (avg of 10 runs)', () => {
    const arrayTime = measureAverage(() => {
      getAllDecisions(policies, memberships, subjects);
    });

    const loopTime = measureAverage(() => {
      for (const subject of subjects) {
        getAllDecisions(policies, memberships, subject);
      }
    });

    const speedup = loopTime / arrayTime;
    console.info(`  Array: ${arrayTime.toFixed(2)}ms, Loop: ${loopTime.toFixed(2)}ms (${speedup.toFixed(1)}x faster)`);

    // Relative threshold: array optimization should provide meaningful gain
    expect(speedup).toBeGreaterThan(2);
  });
});
