import { describe, expect, it } from 'vitest';
import type { ChannelEntityType, EntityActionType, EntityType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { type DeepChannelType, deepChannelRoles, deepEntityTypes, deepItemPolicies, makeDeepHierarchy } from '../testing/deep-fixture.ts';
import { configurePolicyMatrix } from '../testing/policies.ts';
import { computeWideCan, configureWidePermissions, wideMembership, wideOverrides } from '../testing/wide-fixture.ts';
import { resolveCan } from './action-helpers.ts';
import { type CanGrant, computeCan } from './compute-can.ts';
import { getAllDecisions } from './engine/check.ts';
import type { AccessMembership, SubjectForPermission } from './engine/types.ts';
import type { CanState } from './types.ts';

// Policies with 'own' permission for attachment update/delete, plus project-scoped grants
// (attachment guest-read, task member-update) used by the wider coverage below. The wide hierarchy
// declares no elevation, so every organization grant on a product is home-scoped.
const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
  switch (entityType) {
    case 'organization':
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'attachment':
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
      channels.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.project.member({ create: 1, read: 1, update: 'own', delete: 'own' });
      channels.project.guest({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'task':
      channels.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      channels.project.member({ create: 1, read: 1, update: 1, delete: 0 });
      break;
  }
});

describe('computeCan with own permissions', () => {
  it("returns own for update/delete and true for create/read to a member at the attachment's home channel", () => {
    const membership = wideMembership('project', 'p1', 'member');
    const can = computeWideCan('project', membership, policies);

    expect(can.attachment?.create).toBe(true);
    expect(can.attachment?.read).toBe(true);
    expect(can.attachment?.update).toBe('own');
    expect(can.attachment?.delete).toBe('own');
  });

  it("returns true (not own) for admin on all attachment actions at the attachment's home channel", () => {
    const membership = wideMembership('project', 'p1', 'admin');
    const can = computeWideCan('project', membership, policies);

    expect(can.attachment?.create).toBe(true);
    expect(can.attachment?.read).toBe(true);
    expect(can.attachment?.update).toBe(true);
    expect(can.attachment?.delete).toBe(true);
  });

  it("marks an organization member's attachment cells home: the role is not elevated and attachments home below the organization", () => {
    const membership = wideMembership('organization', 'org1', 'member');
    const can = computeWideCan('organization', membership, policies);

    // Create has no row: the map answers it for a row created at the organization, its home.
    expect(can.attachment?.create).toBe(true);
    expect(can.attachment?.read).toBe('home');
    expect(can.attachment?.update).toBe('home:own');
    expect(can.attachment?.delete).toBe('home:own');
  });

  it('returns false for member organization create/update/delete', () => {
    const membership = wideMembership('organization', 'org1', 'member');
    const can = computeCan(policies, 'organization', membership, wideOverrides);

    expect(can.organization?.create).toBe(false);
    expect(can.organization?.update).toBe(false);
    expect(can.organization?.delete).toBe(false);
  });

  it('returns empty map when membership is null', () => {
    const can = computeCan(policies, 'organization', null, wideOverrides);
    expect(can).toEqual({});
  });

  it('returns empty map when membership is undefined', () => {
    const can = computeCan(policies, 'organization', undefined, wideOverrides);
    expect(can).toEqual({});
  });

  it('grants read-only access to a project guest on attachment (guest-only grant)', () => {
    const membership = wideMembership('project', 'p1', 'guest');
    const can = computeWideCan('project', membership, policies);

    expect(can.attachment?.read).toBe(true);
    expect(can.attachment?.create).toBe(false);
    expect(can.attachment?.update).toBe(false);
    expect(can.attachment?.delete).toBe(false);
  });

  it('differs between an organization member and a project member on the same descendant (task)', () => {
    const orgMembership = wideMembership('organization', 'org1', 'member');
    const projectMembership = wideMembership('project', 'p1', 'member');

    const orgCan = computeWideCan('organization', orgMembership, policies);
    const projectCan = computeWideCan('project', projectMembership, policies);

    // The organization member's task grant is home-scoped: it reaches tasks homed at the
    // organization, and a task is always homed at a project, so no row resolves it.
    expect(orgCan.task?.read).toBe('home');
    expect(orgCan.task?.update).toBe(false);

    // Project members hold the grant at the task's home channel: unconditional.
    expect(projectCan.task?.read).toBe(true);
    expect(projectCan.task?.update).toBe(true);
  });
});

describe('computeCan three-state semantics', () => {
  // Policies where every row-conditionable action is 'own' for member. `create` can't take a row
  // condition (rejected at config time: no row exists yet), so it is unconditional here.
  const { policyMatrix: allOwnPolicies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.project.member({ create: 1, read: 'own', update: 'own', delete: 'own' });
        break;
    }
  });

  it('preserves own for every row-conditional action', () => {
    const membership = wideMembership('project', 'p1', 'member');
    const can = computeWideCan('project', membership, allOwnPolicies);

    expect(can.attachment?.read).toBe('own');
    expect(can.attachment?.update).toBe('own');
    expect(can.attachment?.delete).toBe('own');
  });
});

// The engine scopes a role outside `elevatedGrants` to product rows homed at its own channel; the map marks such
// cells `'home'` for `resolveCan`. Every role, channel and action of a hierarchy mixing elevated and home-scoped
// roles runs against the engine, on an `item` homed at the membership's channel and on one homed at a channel below.
describe('computeCan parity with the engine under home scoping', () => {
  const hierarchy = makeDeepHierarchy(undefined, { organization: ['admin'], course: ['staff'], courseSection: ['staff'] });
  const overrides = { hierarchy };
  const actor = 'actor';

  // One cell pattern per role, crossing 1, 'own' and 0 with elevated and home-scoped roles.
  const cellsByRole: Record<string, Partial<Record<EntityActionType, 0 | 1 | 'own'>>> = {
    admin: { create: 1, read: 1, update: 1, delete: 1 },
    staff: { create: 1, read: 1, update: 1, delete: 'own' },
    owner: { create: 1, read: 1, update: 1, delete: 1 },
    member: { create: 1, read: 1, update: 'own', delete: 0 },
    student: { create: 0, read: 1, update: 'own', delete: 'own' },
    follower: { read: 1, update: 'own' },
  };
  const policies = deepItemPolicies((_, role) => cellsByRole[role] ?? {}, overrides);

  // Deep vocabulary, typed independently of the app config, as the fixture's other callers cast it.
  const membershipAt = (channelType: DeepChannelType, role: string): AccessMembership =>
    ({ channelType, channelId: `${channelType}1`, role }) as unknown as AccessMembership;
  const itemStates = (channelType: DeepChannelType, membership: AccessMembership) =>
    (
      computeCan(policies, channelType as unknown as ChannelEntityType, membership, overrides) as Partial<
        Record<string, Record<EntityActionType, CanState>>
      >
    ).item;

  /** An `item` homed at `${home}1`: every ancestor down to `home` set, the deeper ones null. Deep vocabulary, cast. */
  const itemHomedAt = (home: DeepChannelType, createdBy: string): SubjectForPermission => {
    const ancestors = hierarchy.getOrderedAncestors('item');
    const depth = ancestors.indexOf(home);
    return {
      entityType: 'item',
      id: `item-${home}-${createdBy}`,
      createdBy,
      channelIds: Object.fromEntries(ancestors.map((type, i) => [type, i >= depth ? `${type}1` : null])),
    } as unknown as SubjectForPermission;
  };

  const engineCan = (membership: AccessMembership, subject: SubjectForPermission) =>
    getAllDecisions(policies, [membership], subject, { actorId: actor, elevatedGrants: hierarchy.elevatedGrants, ...overrides }).can;

  it('must not show a course student (home-scoped) an update affordance the engine refuses on an item homed in a project below', () => {
    const student = membershipAt('course', 'student');
    const states = itemStates('course', student);
    const below = itemHomedAt('project', actor);
    const home = { row: 'project1', channel: student.channelId };

    expect(engineCan(student, below).update).toBe(false);
    expect(resolveCan(states?.update, actor, actor, home)).toBe(false);

    // Positive controls: the same item homed at the course, and the elevated staff below.
    const atCourse = itemHomedAt('course', actor);
    expect(engineCan(student, atCourse).update).toBe(true);
    expect(resolveCan(states?.update, actor, actor, { row: 'course1', channel: student.channelId })).toBe(true);
    const staff = membershipAt('course', 'staff');
    expect(engineCan(staff, below).update).toBe(true);
    expect(resolveCan(itemStates('course', staff)?.update, actor, actor, home)).toBe(true);
  });

  it('agrees with the engine for every channel, role, action and creator on rows homed at the channel and below it', () => {
    for (const channelType of hierarchy.channelTypes) {
      for (const role of hierarchy.getRoles(channelType)) {
        const membership = membershipAt(channelType, role);
        const states = itemStates(channelType, membership);
        const homes: DeepChannelType[] = channelType === 'project' ? ['project'] : [channelType, 'project'];

        for (const home of homes) {
          for (const action of appConfig.entityActions) {
            // Create has no row: the map answers it for a row created at the membership's channel.
            if (action === 'create' && home !== channelType) continue;
            for (const createdBy of [actor, 'other']) {
              const label = `${channelType} ${role}: ${action} on an item homed at ${home} created by ${createdBy}`;
              const resolved = resolveCan(states?.[action], createdBy, actor, { row: `${home}1`, channel: membership.channelId });
              expect(resolved, label).toBe(engineCan(membership, itemHomedAt(home, createdBy))[action]);
            }
          }
        }
      }
    }
  });
});

// The engine reads every membership the actor holds on a row's chain. The map does the same: the grant on the channel
// itself and the grants above it merge into one cell, which resolves per row to what the engine decides with all of them.
// The casts below carry the deep vocabulary, typed independently of the app config, as the fixture's other callers cast it.
describe('computeCan over the grants on a channel and above it', () => {
  const hierarchy = makeDeepHierarchy(undefined, { organization: ['admin'], course: ['staff'], courseSection: ['staff'] });
  const overrides = { hierarchy };
  const actor = 'actor';
  const channelTypes = hierarchy.channelTypes as readonly DeepChannelType[];

  // One cell pattern per role, crossing 1, 'own' and 0 with elevated and home-scoped roles.
  const cellsByRole: Record<string, Partial<Record<EntityActionType, 0 | 1 | 'own'>>> = {
    admin: { create: 1, read: 1, update: 'own', delete: 0 },
    staff: { create: 0, read: 1, update: 'own', delete: 'own' },
    owner: { create: 1, read: 1, update: 1, delete: 0 },
    member: { create: 1, read: 1, update: 'own', delete: 0 },
    student: { create: 1, read: 1, update: 1, delete: 'own' },
    follower: { read: 1, update: 'own' },
  };

  // Every entity type gets a policy row for each role of each channel on its chain: a channel's own roles and the roles above it.
  const policies = configurePolicyMatrix(
    deepEntityTypes as unknown as readonly EntityType[],
    ({ entityType, channels }) => {
      if ((entityType as string) === 'user') return;
      const builders = channels as unknown as Record<string, Record<string, (cells: Partial<Record<EntityActionType, 0 | 1 | 'own'>>) => void>>;
      const chain = [...(hierarchy.isChannel(entityType) ? [entityType as string] : []), ...hierarchy.getOrderedAncestors(entityType)];
      for (const channelType of chain) {
        // A create cell of 'own' is refused at config time: no row exists yet.
        for (const role of deepChannelRoles[channelType as DeepChannelType]) builders[channelType][role]?.(cellsByRole[role]);
      }
    },
    overrides,
  );

  /** The actor's membership on `${channelType}1`, the one channel of its type in this world. */
  const membershipAt = (channelType: DeepChannelType, role: string): AccessMembership =>
    ({ channelType, channelId: `${channelType}1`, role }) as unknown as AccessMembership;

  /** Every way to hold a role, or none, on each channel of the chain; the empty combination is left out. */
  const grantCombinations = (chain: readonly DeepChannelType[]): AccessMembership[][] =>
    chain
      .reduce<AccessMembership[][]>(
        (combinations, channelType) =>
          combinations.flatMap((held) => [held, ...deepChannelRoles[channelType].map((role) => [...held, membershipAt(channelType, role)])]),
        [[]],
      )
      .filter((held) => held.length > 0);

  const chainOf = (channelType: DeepChannelType) => [channelType, ...hierarchy.getOrderedAncestors(channelType)] as DeepChannelType[];

  /** The ids of `${type}1` for every channel from the organization down to `home`, null below it. */
  const idsDownTo = (ancestors: readonly string[], home: DeepChannelType) => {
    const depth = ancestors.indexOf(home);
    return Object.fromEntries(ancestors.map((type, i) => [type, i >= depth ? `${type}1` : null]));
  };

  const engineCan = (memberships: AccessMembership[], subject: SubjectForPermission) =>
    getAllDecisions(policies, memberships, subject, { actorId: actor, elevatedGrants: hierarchy.elevatedGrants, ...overrides }).can;

  const mapFor = (channelType: DeepChannelType, memberships: AccessMembership[]) =>
    computeCan(policies, channelType as unknown as ChannelEntityType, memberships as unknown as CanGrant[], overrides) as Partial<
      Record<string, Record<EntityActionType, CanState>>
    >;

  const named = (memberships: AccessMembership[]) => memberships.map((m) => `${m.channelType}:${m.role}`).join(' + ');

  it('agrees with the engine on an item homed at the channel and below it, for every combination of grants on the chain', () => {
    let compared = 0;
    for (const channelType of channelTypes) {
      for (const memberships of grantCombinations(chainOf(channelType))) {
        const states = mapFor(channelType, memberships).item;
        // The homes of the rows a page of this channel lists: the channel itself and every channel below it.
        const homes = hierarchy.getOrderedAncestors('item').filter(
          (type) =>
            !chainOf(channelType)
              .slice(1)
              .includes(type as DeepChannelType),
        );
        for (const home of homes as DeepChannelType[]) {
          for (const action of appConfig.entityActions) {
            // Create has no row: the map answers it for a row created at its own channel.
            if (action === 'create' && home !== channelType) continue;
            for (const createdBy of [actor, 'other']) {
              const subject = {
                entityType: 'item',
                id: `item-${home}-${createdBy}`,
                createdBy,
                channelIds: idsDownTo(hierarchy.getOrderedAncestors('item'), home),
              } as unknown as SubjectForPermission;
              const resolved = resolveCan(states?.[action], createdBy, actor, { row: `${home}1`, channel: `${channelType}1` });
              const label = `${channelType} map, grants ${named(memberships)}: ${action} on an item homed at ${home} created by ${createdBy}`;
              expect(resolved, label).toBe(engineCan(memberships, subject)[action]);
              compared++;
            }
          }
        }
      }
    }
    // 2 + 8 + 26 + 80 combinations of grants, each over its homes, actions and creators: no loop above ran empty.
    expect(compared).toBeGreaterThan(1000);
  });

  it('agrees with the engine on the channel itself and on a channel of each type below it', () => {
    let compared = 0;
    for (const channelType of channelTypes) {
      for (const memberships of grantCombinations(chainOf(channelType))) {
        const map = mapFor(channelType, memberships);
        const descendants = hierarchy.getOrderedDescendants(channelType).filter((type) => hierarchy.isChannel(type)) as DeepChannelType[];
        for (const subjectType of [channelType, ...descendants]) {
          for (const action of appConfig.entityActions) {
            for (const createdBy of [actor, 'other']) {
              // The channel of the map, or one of a type below it that hangs under the map's channel.
              const subject = {
                entityType: subjectType,
                id: subjectType === channelType ? `${channelType}1` : `${subjectType}-new`,
                createdBy,
                channelIds: idsDownTo(hierarchy.getOrderedAncestors(subjectType), channelType),
              } as unknown as SubjectForPermission;
              const resolved = resolveCan(map[subjectType]?.[action], createdBy, actor);
              const label = `${channelType} map, grants ${named(memberships)}: ${action} on a ${subjectType} created by ${createdBy}`;
              expect(resolved, label).toBe(engineCan(memberships, subject)[action]);
              compared++;
            }
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(1000);
  });

  it('holds what a grant above allows for a caller without a membership on the channel', () => {
    // An organization admin (elevated) on a project they are no member of.
    const map = mapFor('project', [membershipAt('organization', 'admin')]);
    expect(map.project).toEqual({ create: true, read: true, update: 'own', delete: false });
    expect(map.item).toEqual({ create: true, read: true, update: 'own', delete: false });

    // An organization member is not elevated: its item grant reaches no row of the project, its project grant does.
    const member = mapFor('project', [membershipAt('organization', 'member')]);
    expect(member.project?.read).toBe(true);
    expect(member.item).toEqual({ create: false, read: false, update: false, delete: false });
  });

  it("merges a home-scoped grant on the channel with an 'own' cell from above into one state that takes either", () => {
    // Course student (home-scoped): update any item homed at the course. Organization admin (elevated): update own items anywhere.
    const states = mapFor('course', [membershipAt('course', 'student'), membershipAt('organization', 'admin')]).item;
    expect(states?.update).toBe('home|own');
    expect(resolveCan(states?.update, 'other', actor, { row: 'course1', channel: 'course1' })).toBe(true);
    expect(resolveCan(states?.update, actor, actor, { row: 'project1', channel: 'course1' })).toBe(true);
    expect(resolveCan(states?.update, 'other', actor, { row: 'project1', channel: 'course1' })).toBe(false);
  });

  it('leaves out a grant on a type outside the chain, and answers an empty map without any grant on it', () => {
    expect(mapFor('course', [membershipAt('project', 'owner')])).toEqual({});
    expect(mapFor('course', [])).toEqual({});
    expect(mapFor('course', [membershipAt('project', 'owner'), membershipAt('course', 'staff')])).toEqual(
      mapFor('course', [membershipAt('course', 'staff')]),
    );
  });
});
