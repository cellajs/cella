import { hierarchy } from 'shared';
import { describe, expect, it } from 'vitest';
import { configureWidePermissions, wideMembership, wideSubject, wideOverrides } from '../../testing/wide-fixture';
import { getAllDecisions } from './check';
import type { SubjectForPermission } from './types';

const organizationSubject = (id: string): SubjectForPermission =>
  wideSubject({ entityType: 'organization', id, channelIds: {} });

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

// Real-config guard sanity checks. These assertions hold in every fork (organization is always the
// root channel with roles admin/member; a product is never a channel), so the block is fork-stable.
describe('hierarchy guards (real app config)', () => {
  describe('hierarchy.getOrderedAncestors', () => {
    it('returns empty array for root channel', () => {
      const ancestors = hierarchy.getOrderedAncestors('organization');
      expect(ancestors).toEqual([]);
    });

    it('returns organization as an ancestor for a product entity', () => {
      const ancestors = hierarchy.getOrderedAncestors('attachment');
      expect(ancestors).toContain('organization');
    });
  });

  describe('hierarchy.getRoles', () => {
    it('returns roles for the organization channel', () => {
      const roles = hierarchy.getRoles('organization');
      expect(roles).toEqual(['admin', 'member']);
    });
  });

  describe('hierarchy.isChannel / hierarchy.isProduct', () => {
    it('correctly identifies channel entities', () => {
      expect(hierarchy.isChannel('organization')).toBe(true);
      expect(hierarchy.isChannel('attachment')).toBe(false);
      expect(hierarchy.isChannel('user')).toBe(false);
    });

    it('correctly identifies product entities', () => {
      expect(hierarchy.isProduct('attachment')).toBe(true);
      expect(hierarchy.isProduct('organization')).toBe(false);
      expect(hierarchy.isProduct('user')).toBe(false);
    });
  });
});

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
    const { policyMatrix: policies } = configureWidePermissions(() => {
      // No configuration
    });

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

describe('permission inheritance from organization channel', () => {
  const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
        break;
    }
  });

  it('admin can delete attachments', () => {
    const memberships = [wideMembership('organization', 'org1', 'admin')];
    const subject = attachmentSubject('att1', 'org1');
    const { can } = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(can.delete).toBe(true);
  });

  it('member cannot delete attachments', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1');
    const { can } = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(can.delete).toBe(false);
  });
});

describe('PermissionDecision action attribution', () => {
  const { policyMatrix: policies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
        break;
    }
  });

  it('returns action attribution with grantedBy details', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1');
    const decision = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(decision.actions).toBeDefined();
    expect(decision.actions.create).toBeDefined();
    expect(decision.actions.read).toBeDefined();

    // Member can create - should have grantedBy entry
    expect(decision.actions.create.allowed).toBe(true);
    expect(decision.actions.create.grantedBy).toHaveLength(1);
    expect(decision.actions.create.grantedBy[0]).toEqual({
      type: 'membership',
      channelType: 'organization',
      channelId: 'org1',
      role: 'member',
    });

    // Member cannot delete - should have empty grantedBy
    expect(decision.actions.delete.allowed).toBe(false);
    expect(decision.actions.delete.grantedBy).toHaveLength(0);
  });

  it('returns subject channel IDs for debugging', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1');
    const decision = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    expect(decision.subject.entityType).toBe('attachment');
    expect(decision.subject.id).toBe('att1');
    expect(decision.subject.channelIds).toEqual({ organization: 'org1' });
  });

  it('accumulates multiple grants for same action from different roles', () => {
    const memberships = [
      wideMembership('organization', 'org1', 'admin'),
      wideMembership('organization', 'org1', 'member'),
    ];
    const subject = attachmentSubject('att1', 'org1');
    const decision = getAllDecisions(policies, memberships, subject, { ...wideOverrides });

    // Both admin and member grant read permission
    expect(decision.actions.read.allowed).toBe(true);
    expect(decision.actions.read.grantedBy).toHaveLength(2);
    expect(decision.actions.read.grantedBy).toContainEqual({
      type: 'membership',
      channelType: 'organization',
      channelId: 'org1',
      role: 'admin',
    });
    expect(decision.actions.read.grantedBy).toContainEqual({
      type: 'membership',
      channelType: 'organization',
      channelId: 'org1',
      role: 'member',
    });

    // Only admin grants delete permission
    expect(decision.actions.delete.allowed).toBe(true);
    expect(decision.actions.delete.grantedBy).toHaveLength(1);
    expect(decision.actions.delete.grantedBy[0]).toMatchObject({ type: 'membership', role: 'admin' });
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

  const userId = 'user-actor';
  const otherUserId = 'user-other';

  // --- Pass cases: permission IS granted ---

  it('grants update/delete when member is the creator (own entity)', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: userId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  it('grants create/read to member regardless of ownership', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: otherUserId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
  });

  it('admin gets full access regardless of createdBy', () => {
    const memberships = [wideMembership('organization', 'org1', 'admin')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: otherUserId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  // --- Fail cases: permission is NOT granted ---

  it('denies update/delete when member is NOT the creator', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: otherUserId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when userId is not provided in options', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: userId });
    // No userId in options: own check cannot succeed
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when createdBy is null', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: null });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when createdBy is undefined (missing)', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1');
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies everything when membership is for wrong org', () => {
    const memberships = [wideMembership('organization', 'org2', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: userId });
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    expect(can.create).toBe(false);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });
});

describe('own permission, grant attribution', () => {
  const { policyMatrix: ownPolicies } = configureWidePermissions(({ entityType, channels }) => {
    switch (entityType) {
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  });

  const userId = 'user-actor';

  it('attributes own-granted actions to the condition name (relation:own)', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: userId });
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    // Update was granted via the built-in `own` condition → attributed by condition name
    expect(decision.actions.update.allowed).toBe(true);
    expect(decision.actions.update.grantedBy).toHaveLength(1);
    expect(decision.actions.update.grantedBy[0]).toEqual({ type: 'relation', relation: 'own' });

    // Delete same
    expect(decision.actions.delete.allowed).toBe(true);
    expect(decision.actions.delete.grantedBy).toHaveLength(1);
    expect(decision.actions.delete.grantedBy[0]).toEqual({ type: 'relation', relation: 'own' });
  });

  it('attributes unconditional grants to membership (not relation)', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: userId });
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    // Create is unconditional 1 → membership grant
    expect(decision.actions.create.grantedBy).toHaveLength(1);
    expect(decision.actions.create.grantedBy[0]).toEqual({
      type: 'membership',
      channelType: 'organization',
      channelId: 'org1',
      role: 'member',
    });
  });

  it('does not attribute own grants when ownership check fails', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: 'user-other' });
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    // Update/delete denied: no grants at all
    expect(decision.actions.update.allowed).toBe(false);
    expect(decision.actions.update.grantedBy).toHaveLength(0);
    expect(decision.actions.delete.allowed).toBe(false);
    expect(decision.actions.delete.grantedBy).toHaveLength(0);
  });

  it('admin gets membership grant (not relation) even with createdBy set', () => {
    const memberships = [wideMembership('organization', 'org1', 'admin')];
    const subject = attachmentSubject('att1', 'org1', { createdBy: 'user-other' });
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId, ...wideOverrides });

    // Admin policy is unconditional 1, so grant is membership-based
    expect(decision.actions.update.allowed).toBe(true);
    expect(decision.actions.update.grantedBy[0]).toEqual({
      type: 'membership',
      channelType: 'organization',
      channelId: 'org1',
      role: 'admin',
    });
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

  const userId = 'user-actor';

  it('correctly evaluates mixed ownership in batch', () => {
    const memberships = [wideMembership('organization', 'org1', 'member')];
    const subjects: SubjectForPermission[] = [
      attachmentSubject('att-own', 'org1', { createdBy: userId }),
      attachmentSubject('att-other', 'org1', { createdBy: 'user-other' }),
      attachmentSubject('att-null', 'org1', { createdBy: null }),
    ];

    const results = getAllDecisions(ownPolicies, memberships, subjects, { userId, ...wideOverrides });

    // Own entity: full access via ownership
    const ownDecision = results.get('att-own')!;
    expect(ownDecision.can.update).toBe(true);
    expect(ownDecision.can.delete).toBe(true);

    // Other's entity: denied
    const otherDecision = results.get('att-other')!;
    expect(otherDecision.can.update).toBe(false);
    expect(otherDecision.can.delete).toBe(false);

    // Null createdBy: denied
    const nullDecision = results.get('att-null')!;
    expect(nullDecision.can.update).toBe(false);
    expect(nullDecision.can.delete).toBe(false);

    // All three can still create and read
    for (const id of ['att-own', 'att-other', 'att-null']) {
      const d = results.get(id)!;
      expect(d.can.create).toBe(true);
      expect(d.can.read).toBe(true);
    }
  });
});

// ── Deep-hierarchy coverage the template's org-only config cannot express ─────

describe('wide hierarchy, guest role, multi-level ancestors', () => {
  const { policyMatrix: policies } = configureWidePermissions(
    ({ entityType, channels }) => {
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
    },
  );

  it('grants a project guest their configured project-level cell', () => {
    const subject = attachmentSubject('att1', 'org1', { project: 'p1' });
    const { can } = getAllDecisions(policies, [wideMembership('project', 'p1', 'guest')], subject, {
      ...wideOverrides,
    });
    expect(can.create).toBe(true);
    expect(can.update).toBe(false);
  });

  it('resolves grants from the correct ancestor level (project vs organization)', () => {
    const subject = attachmentSubject('att1', 'org1', { project: 'p1' });

    // A project member gets the project-level update grant.
    const asProjectMember = getAllDecisions(policies, [wideMembership('project', 'p1', 'member')], subject, {
      ...wideOverrides,
    });
    expect(asProjectMember.can.update).toBe(true);

    // An organization member has no attachment cell at the organization level → no grant.
    const asOrgMember = getAllDecisions(policies, [wideMembership('organization', 'org1', 'member')], subject, {
      ...wideOverrides,
    });
    expect(asOrgMember.can.update).toBe(false);
  });
});
