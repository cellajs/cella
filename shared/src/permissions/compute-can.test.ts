import { describe, expect, it } from 'vitest';
import type { ChannelEntityType, EntityActionType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { type DeepChannelType, deepItemPolicies, makeDeepHierarchy } from '../testing/deep-fixture.ts';
import { computeWideCan, configureWidePermissions, wideMembership, wideOverrides } from '../testing/wide-fixture.ts';
import { resolveCan } from './action-helpers.ts';
import { computeCan } from './compute-can.ts';
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
    const can = computeCan('organization', membership, policies, wideOverrides);

    expect(can.organization?.create).toBe(false);
    expect(can.organization?.update).toBe(false);
    expect(can.organization?.delete).toBe(false);
  });

  it('returns empty map when membership is null', () => {
    const can = computeCan('organization', null, policies, wideOverrides);
    expect(can).toEqual({});
  });

  it('returns empty map when membership is undefined', () => {
    const can = computeCan('organization', undefined, policies, wideOverrides);
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
  const hierarchy = makeDeepHierarchy(undefined, {
    organization: ['admin'],
    course: ['staff'],
    courseSection: ['staff'],
  });
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
      computeCan(channelType as unknown as ChannelEntityType, membership, policies, overrides) as Partial<
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
    getAllDecisions(policies, [membership], subject, {
      actorId: actor,
      elevatedGrants: hierarchy.elevatedGrants,
      ...overrides,
    }).can;

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
              const resolved = resolveCan(states?.[action], createdBy, actor, {
                row: `${home}1`,
                channel: membership.channelId,
              });
              expect(resolved, label).toBe(engineCan(membership, itemHomedAt(home, createdBy))[action]);
            }
          }
        }
      }
    }
  });
});
