import { type AccessMembership, hierarchy, mayGrantRole } from 'shared';
import { configureWidePermissions, type WideRole, wideHierarchy, wideMembership, wideOverrides, wideSubject } from 'shared/testing/wide-fixture';
import { describe, expect, it } from 'vitest';
import { membershipsBroughtAlong, resolveAssociatedMembershipRole, resolveOrganizationMembershipRole } from './membership-helpers';

// Derived from the hierarchy so the test holds for any app role registry.
const leastPrivileged = hierarchy.getLeastPrivilegedRole('organization');
const mostPrivileged = hierarchy.getMostPrivilegedRole('organization');

describe('resolveAssociatedMembershipRole', () => {
  it("defaults to the vocabulary's least-privileged role", () => {
    expect(resolveAssociatedMembershipRole('organization', mostPrivileged)).toBe(leastPrivileged);
  });

  it('carries the invited role over when carryRole is set and valid', () => {
    expect(resolveAssociatedMembershipRole('organization', mostPrivileged, true)).toBe(mostPrivileged);
  });

  it('falls back to the least-privileged role for an invited role outside the vocabulary, even with carryRole', () => {
    expect(resolveAssociatedMembershipRole('organization', 'not-a-role' as any, true)).toBe(leastPrivileged);
  });
});

describe('resolveOrganizationMembershipRole', () => {
  // The organization cannot declare organizationRoles; mapping resolution against a declared map is
  // covered by the config-builder tests (entity-hierarchy.test.ts).
  it('throws for a channel without an organizationRoles map: explicit escalation is required', () => {
    expect(() => resolveOrganizationMembershipRole('organization', mostPrivileged)).toThrow(/organizationRoles/);
  });
});

/**
 * An invitation hands out its role and, at the accept, those of the memberships it brings along. The wide project brings
 * along an organization row of its own role and carries it to the workspace it is filed under, as a section its course.
 */
describe("must not create an organization or parent-channel role above the inviter's through a channel invitation", () => {
  const { policyMatrix } = configureWidePermissions(({ entityType, channels }) => {
    if (entityType === 'organization') {
      channels.organization.admin({ read: 1, update: 1, delete: 1 });
      channels.organization.member({ read: 1 });
    }
    if (entityType === 'workspace' || entityType === 'project') {
      channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      channels.organization.member({ read: 1 });
      channels[entityType].admin({ read: 1, update: 1, delete: 1 });
      // Project members manage the project, the cell an app sets to let them invite.
      channels[entityType].member({ read: 1, update: entityType === 'project' ? 1 : 0 });
      channels[entityType].guest({ read: 1 });
    }
  });

  const project = { entityType: 'project', id: 'project-1', organizationId: 'org-1', workspaceId: 'workspace-1' };
  const menuParent = { channelType: 'workspace', carryRole: true } as const;
  const organization = (role: 'admin' | 'member') => wideMembership('organization', project.organizationId, role);
  const workspace = (role: WideRole) => wideMembership('workspace', project.workspaceId, role);
  const inProject = (role: WideRole) => wideMembership('project', project.id, role);

  /** The channels on which an invitation to the project at `role` hands out a role the inviter may not grant. */
  const refusedOn = (inviter: AccessMembership[], role: WideRole, isSystemAdmin = false) =>
    [{ channelType: 'project' as const, channelId: project.id, role }, ...membershipsBroughtAlong(project, role, menuParent, wideHierarchy)]
      .filter((grant) => {
        const channelIds = grant.channelType === 'organization' ? {} : { organization: project.organizationId };
        const subject = wideSubject({ entityType: grant.channelType, id: grant.channelId, channelIds });
        return !mayGrantRole(policyMatrix, inviter, { subject, role: grant.role, action: 'update' }, { ...wideOverrides, isSystemAdmin });
      })
      .map(({ channelType }) => channelType);

  it('refuses a role the inviter holds on the project only, wherever the invitation would create it', () => {
    // A project admin who is a member above: the accept would make an organization and a workspace admin.
    expect(refusedOn([organization('member'), workspace('member'), inProject('admin')], 'admin')).toEqual(['organization', 'workspace']);
    // The carried role alone outranks a workspace guest.
    expect(refusedOn([organization('member'), workspace('guest'), inProject('admin')], 'member')).toEqual(['workspace']);
    // A project member who manages the project hands out no role above their own on it either.
    expect(refusedOn([organization('member'), workspace('member'), inProject('member')], 'admin')).toEqual(['project', 'organization', 'workspace']);
  });

  it('lets an inviter hand out roles at or below their own, every role from above, and the lowest role always (rightful)', () => {
    expect(refusedOn([organization('admin'), workspace('admin'), inProject('admin')], 'admin')).toEqual([]);
    expect(refusedOn([organization('member'), workspace('member'), inProject('admin')], 'member')).toEqual([]);
    expect(refusedOn([organization('admin')], 'admin')).toEqual([]);
    expect(refusedOn([organization('member'), workspace('member'), inProject('member')], 'guest')).toEqual([]);
    expect(refusedOn([], 'admin', true)).toEqual([]);
  });
});
