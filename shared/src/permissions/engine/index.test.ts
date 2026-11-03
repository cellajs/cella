import { describe, expect, it } from 'vitest';
import type { EntityActionType, EntityType } from '../../../types.ts';
import { appConfig } from '../../config-builder/app-config.ts';
import { type DeepChannelType, deepChannelRoles, deepElevatedHierarchy, deepEntityTypes } from '../../testing/deep-fixture.ts';
import { configurePolicyMatrix } from '../../testing/policies.ts';
import {
  configureWidePermissions,
  makeWideHierarchy,
  type WideChannelType,
  wideMembership,
  wideOverrides,
  wideSubject,
} from '../../testing/wide-fixture.ts';
import { getAllDecisions } from './check.ts';
import type { AccessMembership, SubjectForPermission } from './types.ts';

const organizationSubject = (id: string): SubjectForPermission => wideSubject({ entityType: 'organization', id, channelIds: {} });

const attachmentSubject = (
  id: string,
  organizationId: string,
  overrides: { createdBy?: string | null; project?: string } = {},
): SubjectForPermission => {
  const { project, ...rest } = overrides;
  return wideSubject({
    entityType: 'attachment',
    id,
    channelIds: { organization: organizationId, ...(project !== undefined && { project }) },
    ...rest,
  });
};

describe('configureWidePermissions', () => {
  it('configures policies for all entity types', () => {
    const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
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

    expect(policies.organization).toBeDefined();
    expect(policies.organization).toHaveLength(2);
    expect(policies.attachment).toBeDefined();
    expect(policies.attachment).toHaveLength(2);
  });

  it('creates empty policies when no config is set', () => {
    const { policyMatrix: policies } = configureWidePermissions(() => {});

    expect(policies.organization).toBeUndefined();
  });
});

describe('engine decisions (getAllDecisions)', () => {
  const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
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

  it('grants full permissions for admin on organization', () => {
    const memberships = [wideMembership('organization', 'org1', 'admin')];
    const subject = organizationSubject('org1');
    const { can } = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  it('grants limited permissions for member on organization', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = organizationSubject('org1');
    const { can } = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(can.create).toBe(false);
    expect(can.read).toBe(true);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('grants create permission for member on attachment', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1');
    const { can } = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies access when no matching membership', () => {
    const memberships = [wideMembership('organization', 'org2', 'member')];
    const subject = attachmentSubject('att1', 'org1');
    const { can } = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(can.create).toBe(false);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });
});

// A product grant reaches rows homed below the granting channel only through a role the hierarchy elevates; any other
// role's grant stops at the rows homed at that channel. The other describes elevate no role and decide on rows homed
// at the granting channel.
describe('home scoping under elevated roles', () => {
  const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: 1, delete: 1 });
        break;
    }
  });
  const options = { hierarchy: makeWideHierarchy({ organization: ['admin'] }) };
  const projectAttachment = attachmentSubject('att1', 'org1', { project: 'p1' });

  it('must not let an organization member reach a project-homed attachment via an organization grant', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const { can } = getAllDecisions(policies, memberships, projectAttachment, options);

    expect([can.read, can.update, can.delete]).toEqual([false, false, false]);
  });

  it('the elevated admin keeps the grant on that row, and the member keeps it on an organization-homed row', () => {
    const admin = getAllDecisions(policies, [wideMembership('organization', 'org1', 'admin')], projectAttachment, options);
    expect(admin.can.delete).toBe(true);

    const memberships = [wideMembership('organization', 'org1', 'member')];
    const atHome = getAllDecisions(policies, memberships, attachmentSubject('att2', 'org1'), options);
    expect(atHome.can.delete).toBe(true);
  });
});

// The same rule on four levels, where a course or section role sits between the organization and the item's project.
// The deep vocabulary is typed independently of the app config, so subjects, memberships and builders are cast to it.
describe('home scoping on a deep chain', () => {
  const hierarchy = deepElevatedHierarchy;
  const actor = 'actor';
  type Cells = Partial<Record<EntityActionType, 0 | 1 | 'own'>>;
  // Organization admins and course and section staff are elevated; members and students are not.
  const cellsByRole: Record<string, Cells> = {
    admin: { create: 1, read: 1, update: 'own', delete: 0 },
    staff: { create: 0, read: 1, update: 'own', delete: 'own' },
    owner: { create: 1, read: 1, update: 1, delete: 0 },
    member: { create: 1, read: 1, update: 'own', delete: 0 },
    student: { create: 1, read: 1, update: 1, delete: 'own' },
    follower: { read: 1, update: 'own' },
  };

  // Every entity type gets the role's cells on each channel of its chain.
  const policies = configurePolicyMatrix(
    deepEntityTypes as unknown as readonly EntityType[],
    ({ entityType, channels }) => {
      if ((entityType as string) === 'user') return;
      const builders = channels as unknown as Record<string, Record<string, (cells: Cells) => void>>;
      const chain = [...(hierarchy.isChannel(entityType) ? [entityType as string] : []), ...hierarchy.getOrderedAncestors(entityType)];
      for (const channelType of chain) {
        for (const role of deepChannelRoles[channelType as DeepChannelType]) builders[channelType][role]?.(cellsByRole[role]);
      }
    },
    { hierarchy },
  );

  const at = (channelType: DeepChannelType, role: string): AccessMembership =>
    ({ channelType, channelId: `${channelType}1`, role }) as unknown as AccessMembership;

  /** The ids of `${type}1` from the organization down to `home`, null below it. */
  const subjectHomedAt = (entityType: string, home: DeepChannelType, createdBy: string): SubjectForPermission => {
    const ancestors = hierarchy.getOrderedAncestors(entityType);
    const depth = ancestors.indexOf(home);
    const channelIds = Object.fromEntries(ancestors.map((type, i) => [type, i >= depth ? `${type}1` : null]));
    return { entityType, id: `${entityType}-${home}-${createdBy}`, createdBy, channelIds } as unknown as SubjectForPermission;
  };

  const can = (memberships: AccessMembership[], subject: SubjectForPermission) =>
    getAllDecisions(policies, memberships, subject, { hierarchy, actorId: actor }).can;

  it('must not let a course student (home-scoped) update or delete their own item homed in a project below', () => {
    const student = [at('course', 'student')];
    expect(can(student, subjectHomedAt('item', 'project', actor))).toMatchObject({ update: false, delete: false });

    // Positive controls: the same item homed at the course, and the elevated course staff below.
    expect(can(student, subjectHomedAt('item', 'course', actor))).toMatchObject({ update: true, delete: true });
    expect(can([at('course', 'staff')], subjectHomedAt('item', 'project', actor))).toMatchObject({ update: true, delete: true });
  });

  it("takes either grant when a home-scoped grant on the channel meets an elevated 'own' cell above it", () => {
    const memberships = [at('course', 'student'), at('organization', 'admin')];

    expect(can(memberships, subjectHomedAt('item', 'course', 'other')).update).toBe(true);
    expect(can(memberships, subjectHomedAt('item', 'project', actor)).update).toBe(true);
    expect(can(memberships, subjectHomedAt('item', 'project', 'other')).update).toBe(false);
  });

  it('counts every grant above for a channel subject, and only an elevated one for the product rows below it', () => {
    const project = subjectHomedAt('project', 'courseSection', 'other');
    const item = subjectHomedAt('item', 'project', 'other');

    expect(can([at('organization', 'admin')], project)).toEqual({ create: true, read: true, update: false, delete: false });
    expect(can([at('organization', 'admin')], subjectHomedAt('project', 'courseSection', actor)).update).toBe(true);
    expect(can([at('organization', 'admin')], item).read).toBe(true);

    expect(can([at('organization', 'member')], project).read).toBe(true);
    expect(can([at('organization', 'member')], item)).toEqual({ create: false, read: false, update: false, delete: false });
  });

  it('grants each role its cells on rows homed at its channel, and on rows homed below only when the role is elevated', () => {
    for (const channelType of hierarchy.channelTypes as readonly DeepChannelType[]) {
      for (const role of deepChannelRoles[channelType]) {
        const elevated = hierarchy.elevatedGrants.has(`${channelType}:${role}`);
        const homes: DeepChannelType[] = channelType === 'project' ? ['project'] : [channelType, 'project'];
        for (const home of homes) {
          for (const createdBy of [actor, 'other']) {
            const decided = can([at(channelType, role)], subjectHomedAt('item', home, createdBy));
            for (const action of appConfig.entityActions) {
              const cell = cellsByRole[role][action] ?? 0;
              const cellAllows = cell === 1 || (cell === 'own' && createdBy === actor);
              const label = `${channelType} ${role}: ${action} on an item homed at ${home} created by ${createdBy}`;
              expect(decided[action], label).toBe(cellAllows && (home === channelType || elevated));
            }
          }
        }
      }
    }
  });
});

describe('roles held together', () => {
  const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
        break;
    }
  });

  it('grants what either role on the channel grants', () => {
    const memberships = [wideMembership('organization', 'org1', 'admin'), wideMembership('organization', 'org1', 'member')];
    const { can } = getAllDecisions(policies, memberships, attachmentSubject('att1', 'org1'), { ...wideOverrides });

    expect(can).toEqual({ create: true, read: true, update: true, delete: true });
  });
});

// ── 'own' permission value tests ─────────────────────────────────────────────

describe('own permission policy, ownership-scoped access', () => {
  const { policyMatrix: ownPolicies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'organization':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
        break;
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  });

  const actorId = 'user-actor';
  const otherUserId = 'user-other';

  it('grants update/delete when member is the creator (own entity)', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: actorId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { actorId, ...wideOverrides });

    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  it('grants create/read to member regardless of ownership', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: otherUserId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { actorId, ...wideOverrides });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
  });

  it('admin gets full access regardless of createdBy', () => {
    const memberships = [wideMembership('organization', 'org1', 'admin')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: otherUserId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { actorId, ...wideOverrides });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  it('denies update/delete when member is NOT the creator', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: otherUserId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { actorId, ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when actorId is not provided in options', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: actorId });
    // No actorId in options: own check cannot succeed
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when createdBy is null', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: null });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { actorId, ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when createdBy is undefined (missing)', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1');
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { actorId, ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies everything when membership is for wrong org', () => {
    const memberships = [wideMembership('organization', 'org2', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: actorId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { actorId, ...wideOverrides });

    expect(can.create).toBe(false);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });
});

describe('own permission, batch subjects', () => {
  const { policyMatrix: ownPolicies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  });

  const actorId = 'user-actor';

  it('correctly evaluates mixed ownership in batch', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subjects: SubjectForPermission[] = [
      attachmentSubject('att-own', 'org1', { createdBy: actorId }),
      attachmentSubject('att-other', 'org1', { createdBy: 'user-other' }),
      attachmentSubject('att-null', 'org1', { createdBy: null }),
    ];

    const results = getAllDecisions(ownPolicies, memberships, subjects, { actorId, ...wideOverrides });

    const ownDecision = results.get('att-own')!;
    expect(ownDecision.can.update).toBe(true);
    expect(ownDecision.can.delete).toBe(true);

    const otherDecision = results.get('att-other')!;
    expect(otherDecision.can.update).toBe(false);
    expect(otherDecision.can.delete).toBe(false);

    const nullDecision = results.get('att-null')!;
    expect(nullDecision.can.update).toBe(false);
    expect(nullDecision.can.delete).toBe(false);

    for (const id of ['att-own', 'att-other', 'att-null']) {
      const d = results.get(id)!;
      expect(d.can.create).toBe(true);
      expect(d.can.read).toBe(true);
    }
  });
});

// ── Deep-hierarchy coverage the template's org-only config cannot express ─────

describe('wide hierarchy, guest role, multi-level ancestors', () => {
  const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        // Guests can create at project level. Omitted actions and policy rows deny by default.
        channels.project.admin({ create: 1, update: 1 });
        channels.project.member({ create: 1, update: 1 });
        channels.project.guest({ create: 1 });
        break;
      case 'task':
        channels.organization.admin({ read: 1 });
        channels.project.admin({ read: 1, update: 1 });
        channels.project.member({ read: 1, update: 1 });
        break;
    }
  });

  it('grants a project guest their configured project-level cell and nothing else', () => {
    const subject = attachmentSubject('att1', 'org1', { project: 'p1' });
    const { can } = getAllDecisions(policies, [wideMembership('project', 'p1', 'guest')], subject, { ...wideOverrides });
    expect(can).toEqual({ create: true, read: false, update: false, delete: false });
  });

  it('resolves grants from the correct ancestor level (project vs organization)', () => {
    const subject = attachmentSubject('att1', 'org1', { project: 'p1' });

    const asProjectMember = getAllDecisions(policies, [wideMembership('project', 'p1', 'member')], subject, { ...wideOverrides });
    expect(asProjectMember.can.update).toBe(true);

    const asOrgMember = getAllDecisions(policies, [wideMembership('organization', 'org1', 'member')], subject, { ...wideOverrides });
    expect(asOrgMember.can.update).toBe(false);
  });
});

// A grant holds in the channel it was given and nowhere else: not in another channel type sharing the id, not in a
// sibling project, and not upward, on the organization or on a row homed above the membership's channel.
describe('grants stay in their channel', () => {
  const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'organization':
        channels.organization.admin({ read: 1, update: 1, delete: 1 });
        break;
      case 'project':
        channels.project.admin({ read: 1, update: 1, delete: 1 });
        break;
      case 'task':
        channels.organization.admin({ read: 1 });
        channels.project.admin({ create: 1, read: 1, update: 1, delete: 1 });
        break;
    }
  });
  // Memberships carry their organization, as the app's rows do: it names where the row lives, never a grant there.
  const adminOf = (channelType: WideChannelType, channelId: string): AccessMembership =>
    ({ ...wideMembership(channelType, channelId, 'admin'), organizationId: 'org1' }) as AccessMembership;
  const taskIn = (project: string | null) =>
    wideSubject({ entityType: 'task', id: `task-${project}`, channelIds: { organization: 'org1', project } });
  const denied = { create: false, read: false, update: false, delete: false };

  it.each([
    {
      cell: 'a workspace admin on the project sharing its id',
      membership: adminOf('workspace', 'p1'),
      subject: wideSubject({ entityType: 'project', id: 'p1', channelIds: { organization: 'org1' } }),
    },
    { cell: 'a workspace admin on a task of the project sharing its id', membership: adminOf('workspace', 'p1'), subject: taskIn('p1') },
    { cell: 'a project admin on a task of a sibling project', membership: adminOf('project', 'p2'), subject: taskIn('p1') },
    {
      cell: 'a project admin on the organization above',
      membership: adminOf('project', 'p1'),
      subject: wideSubject({ entityType: 'organization', id: 'org1', channelIds: {} }),
    },
    { cell: 'a project admin on a task homed at the organization', membership: adminOf('project', 'p1'), subject: taskIn(null) },
  ])('denies every action to $cell', ({ membership, subject }) => {
    expect(getAllDecisions(policies, [membership], subject, { ...wideOverrides }).can).toEqual(denied);
  });

  it('grants the project admin every action on a task of their own project (positive control)', () => {
    const { can } = getAllDecisions(policies, [adminOf('project', 'p1')], taskIn('p1'), { ...wideOverrides });
    expect(can).toEqual({ create: true, read: true, update: true, delete: true });
  });
});
