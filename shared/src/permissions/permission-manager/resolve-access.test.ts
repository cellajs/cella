import { describe, expect, it } from 'vitest';
import {
  configureWidePermissions,
  type WideChannelType,
  type WideProductType,
  type WideRole,
  wideMembership,
  wideSubject,
  wideTopology,
} from '../../testing/wide-fixture';
import type { PermissionMembership, SubjectForPermission } from './types';
import { getAllDecisions } from './check';
import { getDecisionsForAccesses, type EngineAccess } from './resolve-access';

/**
 * THE guarantee that lets `checkAccess` collapse accesses into classes: for every access,
 * the batch decision must equal the mapped single decision, over policies the template
 * itself never ships (row conditions, public read, guest roles, deep hierarchies,
 * `elevatedRoles`). This is the property the dispatch fan-out ultimately rides on; it
 * lives HERE because only the engine's own tests can inject synthetic policies.
 */
const ORGS = ['org1', 'org2'];
const PROJECTS = ['proj1', 'proj2', 'proj3'];
const WORKSPACES = ['ws1', 'ws2'];
const USERS = ['user1', 'user2', 'user3', 'user4'];

interface PolicyScenario {
  name: string;
  result: ReturnType<typeof configureWidePermissions>;
  elevatedRoles?: readonly string[];
}

const scenarios: PolicyScenario[] = [
  {
    name: 'role-only grants',
    result: configureWidePermissions(({ subject, contexts }) => {
      switch (subject.name) {
        case 'organization':
          contexts.organization.admin({ read: 1, update: 1, delete: 1 });
          contexts.organization.member({ read: 1 });
          break;
        case 'task':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.organization.member({ create: 1, read: 1 });
          contexts.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.project.member({ create: 1, read: 1, update: 1 });
          contexts.project.guest({ read: 1 });
          break;
        case 'attachment':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.organization.member({ create: 1, read: 1 });
          break;
      }
    }),
  },
  {
    name: 'own-conditional grants',
    result: configureWidePermissions(({ subject, contexts }) => {
      switch (subject.name) {
        case 'organization':
          contexts.organization.admin({ read: 1, update: 1, delete: 1 });
          contexts.organization.member({ read: 1 });
          break;
        case 'project':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.organization.member({ read: 1 });
          contexts.project.member({ read: 1, update: 'own' });
          contexts.project.guest({ read: 'own' });
          break;
        case 'task':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.project.member({ create: 1, read: 'own', update: 'own', delete: 'own' });
          contexts.project.guest({ read: 'own' });
          break;
      }
    }),
  },
  {
    name: 'public read + elevated roles',
    result: configureWidePermissions(({ subject, contexts, publicRead }) => {
      switch (subject.name) {
        case 'organization':
          contexts.organization.admin({ read: 1, update: 1, delete: 1 });
          contexts.organization.member({ read: 1 });
          break;
        case 'attachment':
          publicRead();
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.organization.member({ create: 1, read: 1 });
          contexts.project.member({ create: 1, read: 1, update: 'own' });
          break;
        case 'label':
          contexts.organization.member({ read: 1 });
          contexts.project.guest({ read: 1 });
          break;
      }
    }),
    elevatedRoles: ['admin'],
  },
];

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

const makeRandomizer = (seed: number) => {
  const random = mulberry32(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)];

  const randomSubject = (): SubjectForPermission => {
    const productTypes: WideProductType[] = ['task', 'label', 'attachment'];
    const channelTypes: WideChannelType[] = ['organization', 'workspace', 'project'];
    const organization = pick(ORGS);
    const createdBy = random() < 0.3 ? null : pick(USERS);
    const row = {
      createdBy,
      ...(random() < 0.3 ? { publicAt: '2026-07-01T00:00:00Z' } : {}),
    };

    if (random() < 0.6) {
      return wideSubject({
        entityType: pick(productTypes),
        id: `subject-${Math.floor(random() * 1e9)}`,
        createdBy,
        channelIds: { organization, project: random() < 0.7 ? pick(PROJECTS) : null },
        row,
      });
    }
    const channelType = pick(channelTypes);
    return wideSubject({
      entityType: channelType,
      id: channelType === 'organization' ? organization : channelType === 'project' ? pick(PROJECTS) : pick(WORKSPACES),
      createdBy,
      channelIds: channelType === 'organization' ? {} : { organization },
      row,
    });
  };

  const randomAccess = (): EngineAccess => {
    if (random() < 0.08) return { memberships: [] }; // anonymous
    const roles: WideRole[] = ['admin', 'member', 'guest'];
    const membershipCount = Math.floor(random() * 4);
    const memberships: PermissionMembership[] = Array.from({ length: membershipCount }, () => {
      const kind = random();
      if (kind < 0.5) return wideMembership('organization', pick(ORGS), pick(['admin', 'member'] as WideRole[]));
      if (kind < 0.85) return wideMembership('project', pick(PROJECTS), pick(roles));
      return wideMembership('workspace', pick(WORKSPACES), pick(roles));
    });
    return {
      memberships,
      userId: pick(USERS),
      isSystemAdmin: random() < 0.05,
    };
  };

  return { random, pick, randomSubject, randomAccess };
};

describe('getDecisionsForAccesses ≍ mapped getAllDecisions', () => {
  for (const scenario of scenarios) {
    it(`agrees on can + membership for every access — ${scenario.name}`, () => {
      const SEED = 0xacce55;
      const { randomSubject, randomAccess } = makeRandomizer(SEED);
      const { accessPolicies, publicReadGrants } = scenario.result;
      const baseOptions = {
        topology: wideTopology,
        publicGrants: publicReadGrants,
        elevatedRoles: scenario.elevatedRoles,
      };

      for (let iteration = 0; iteration < 150; iteration++) {
        const subject = randomSubject();
        const accesses = Array.from({ length: 40 }, randomAccess);

        const batch = getDecisionsForAccesses(accessPolicies, accesses, subject, baseOptions);

        for (const [index, access] of accesses.entries()) {
          const single = getAllDecisions(accessPolicies, access.memberships, subject, {
            ...baseOptions,
            userId: access.userId,
            isSystemAdmin: access.isSystemAdmin,
          });
          const label = `seed=0x${SEED.toString(16)} scenario=${scenario.name} iteration=${iteration} access=${index}`;
          expect(batch[index].can, label).toEqual(single.can);
          expect(batch[index].membership, label).toBe(single.membership);
        }
      }
    });
  }
});

describe('getDecisionsForAccesses: invalid memberships', () => {
  const { accessPolicies } = scenarios[0].result;
  const subject = wideSubject({
    entityType: 'task',
    id: 'task-x',
    channelIds: { organization: 'org1', project: 'proj1' },
    row: { createdBy: null },
  });
  const valid: EngineAccess = { memberships: [wideMembership('project', 'proj1', 'member')], userId: 'user1' };
  const invalid: EngineAccess = {
    memberships: [
      wideMembership('project', 'proj1', 'member'),
      { channelType: 'project', channelId: '', role: 'member' } as unknown as PermissionMembership,
    ],
    userId: 'user2',
  };

  it("'deny' fail-closes just the invalid access, order-independent", () => {
    // invalid FIRST: a shared class would cache its deny onto the valid access
    const decisions = getDecisionsForAccesses(accessPolicies, [invalid, valid], subject, {
      topology: wideTopology,
      onInvalidMembership: 'deny',
    });
    expect(decisions[0].can.read).toBe(false);
    expect(decisions[0].membership).toBeNull();
    expect(decisions[1].can.read).toBe(true);
  });

  it("default ('throw') surfaces the malformed membership like the single-access path", () => {
    expect(() =>
      getDecisionsForAccesses(accessPolicies, [invalid, valid], subject, { topology: wideTopology }),
    ).toThrow(/Membership/);
  });
});
