import {
  appConfig,
  type ContextEntityType,
  configureAccessPolicies,
  type EntityRole,
  getContextRoles,
  hierarchy,
  isContextEntity,
  isProductEntity,
} from 'shared';
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

/** Creates a test membership with required fields */
const createTestMembership = (
  overrides: { contextType: ContextEntityType; role: EntityRole; organizationId: string } & Partial<TestMembership>,
): TestMembership => ({
  id: 'mem-test',
  tenantId: 'test01',
  userId: 'user-test',
  displayOrder: 0,
  muted: false,
  archived: false,
  workspaceId: null,
  projectId: null,
  ...overrides,
});

/**
 * These tests use appConfig.hierarchy which defines:
 * - organization: context entity with roles ['admin', 'member']
 * - attachment: product entity with parent 'organization'
 * - page: product entity with parent null (global)
 */

describe('hierarchy (from appConfig.hierarchy)', () => {
  describe('hierarchy.getOrderedAncestors', () => {
    it('returns empty array for root context', () => {
      const ancestors = hierarchy.getOrderedAncestors('organization');
      expect(ancestors).toEqual([]);
    });

    it('returns direct parent for product entity', () => {
      const ancestors = hierarchy.getOrderedAncestors('attachment');
      expect(ancestors).toContain('organization');
    });

    it('returns empty array for page entity (no organization scope)', () => {
      // Note: page entities in cella have parent: null (global)
      const ancestors = hierarchy.getOrderedAncestors('page');
      expect(ancestors).toEqual([]);
    });
  });

  describe('getContextRoles', () => {
    it('returns roles for context entity', () => {
      const roles = getContextRoles('organization');
      // hierarchy has roles: ['admin', 'member'] for organization
      expect(roles).toEqual(['admin', 'member']);
    });
  });

  describe('isContextEntity / isProductEntity', () => {
    it('correctly identifies context entities', () => {
      expect(isContextEntity('organization')).toBe(true);
      expect(isContextEntity('attachment')).toBe(false);
      expect(isContextEntity('page')).toBe(false);
      expect(isContextEntity('user')).toBe(false);
    });

    it('correctly identifies product entities', () => {
      expect(isProductEntity('attachment')).toBe(true);
      expect(isProductEntity('page')).toBe(true);
      expect(isProductEntity('organization')).toBe(false);
      expect(isProductEntity('user')).toBe(false);
    });
  });
});

describe('configureAccessPolicies', () => {
  it('configures policies for all entity types', () => {
    const policies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
      switch (subject.name) {
        case 'organization':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
          break;
        case 'attachment':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
          contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
          break;
      }
    });

    expect(policies.organization).toBeDefined();
    expect(policies.organization).toHaveLength(2);
    expect(policies.attachment).toBeDefined();
    expect(policies.attachment).toHaveLength(2);
  });

  it('creates empty policies when no config is set', () => {
    const policies = configureAccessPolicies(appConfig.entityTypes, () => {
      // No configuration
    });

    expect(policies.organization).toBeUndefined();
  });
});

describe('checkPermission', () => {
  const policies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'organization':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
        break;
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
        break;
      case 'page':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 1, delete: 0 });
        break;
    }
  });

  it('grants full permissions for admin on organization', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'admin' }),
    ];
    const subject: SubjectForPermission = { entityType: 'organization', id: 'org1', organizationId: 'org1' };
    const { can } = getAllDecisions(policies, memberships, subject);

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  it('grants limited permissions for member on organization', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'organization', id: 'org1', organizationId: 'org1' };
    const { can } = getAllDecisions(policies, memberships, subject);

    expect(can.create).toBe(false);
    expect(can.read).toBe(true);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('grants create permission for member on attachment', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = getAllDecisions(policies, memberships, subject);

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies access when no matching membership', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org2', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = getAllDecisions(policies, memberships, subject);

    expect(can.create).toBe(false);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });
});

describe('permission inheritance from organization context', () => {
  const policies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
        break;
    }
  });

  it('admin can delete attachments', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'admin' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = getAllDecisions(policies, memberships, subject);

    expect(can.delete).toBe(true);
  });

  it('member cannot delete attachments', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = getAllDecisions(policies, memberships, subject);

    expect(can.delete).toBe(false);
  });
});

describe('PermissionDecision action attribution', () => {
  const policies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
        break;
    }
  });

  it('returns action attribution with grantedBy details', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = getAllDecisions(policies, memberships, subject);

    // Check actions structure exists
    expect(decision.actions).toBeDefined();
    expect(decision.actions.create).toBeDefined();
    expect(decision.actions.read).toBeDefined();

    // Member can create - should have grantedBy entry
    expect(decision.actions.create.enabled).toBe(true);
    expect(decision.actions.create.grantedBy).toHaveLength(1);
    expect(decision.actions.create.grantedBy[0]).toEqual({
      type: 'membership',
      contextType: 'organization',
      contextId: 'org1',
      role: 'member',
    });

    // Member cannot delete - should have empty grantedBy
    expect(decision.actions.delete.enabled).toBe(false);
    expect(decision.actions.delete.grantedBy).toHaveLength(0);
  });

  it('returns subject context IDs for debugging', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = getAllDecisions(policies, memberships, subject);

    expect(decision.subject.entityType).toBe('attachment');
    expect(decision.subject.id).toBe('att1');
    expect(decision.subject.contextIds).toEqual({ organization: 'org1' });
  });

  it('returns orderedContexts and primaryContext', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = getAllDecisions(policies, memberships, subject);

    expect(decision.orderedContexts).toEqual(['organization']);
    expect(decision.primaryContext).toBe('organization');
  });

  it('accumulates multiple grants for same action from different roles', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'admin' }),
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member' }),
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = getAllDecisions(policies, memberships, subject);

    // Both admin and member grant read permission
    expect(decision.actions.read.enabled).toBe(true);
    expect(decision.actions.read.grantedBy).toHaveLength(2);
    expect(decision.actions.read.grantedBy).toContainEqual({
      type: 'membership',
      contextType: 'organization',
      contextId: 'org1',
      role: 'admin',
    });
    expect(decision.actions.read.grantedBy).toContainEqual({
      type: 'membership',
      contextType: 'organization',
      contextId: 'org1',
      role: 'member',
    });

    // Only admin grants delete permission
    expect(decision.actions.delete.enabled).toBe(true);
    expect(decision.actions.delete.grantedBy).toHaveLength(1);
    expect(decision.actions.delete.grantedBy[0]).toMatchObject({ type: 'membership', role: 'admin' });
  });
});

// ── 'own' permission value tests ─────────────────────────────────────────────

describe('own permission policy — ownership-scoped access', () => {
  // Policies mirroring the real attachment config: member gets 'own' for update/delete
  const ownPolicies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'organization':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
        break;
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  });

  const userId = 'user-actor';
  const otherUserId = 'user-other';

  // --- Pass cases: permission IS granted ---

  it('grants update/delete when member is the creator (own entity)', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: userId,
    };
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId });

    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  it('grants create/read to member regardless of ownership', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: otherUserId, // Not the actor
    };
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
  });

  it('admin gets full access regardless of createdBy', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'admin', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: otherUserId, // Created by someone else
    };
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId });

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  // --- Fail cases: permission is NOT granted ---

  it('denies update/delete when member is NOT the creator', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: otherUserId, // Someone else created it
    };
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when userId is not provided in options', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: userId, // Same user, but userId not passed in options
    };
    // No userId in options — own check cannot succeed
    const { can } = getAllDecisions(ownPolicies, memberships, subject);

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when createdBy is null', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: null,
    };
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies update/delete when createdBy is undefined (missing)', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      // createdBy intentionally omitted
    };
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId });

    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('denies everything when membership is for wrong org', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org2', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: userId,
    };
    const { can } = getAllDecisions(ownPolicies, memberships, subject, { userId });

    expect(can.create).toBe(false);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });
});

describe('own permission — grant attribution', () => {
  const ownPolicies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  });

  const userId = 'user-actor';

  it('attributes own-granted actions to relation:owner', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: userId,
    };
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId });

    // Update was granted via 'own' → should be attributed to relation:owner
    expect(decision.actions.update.enabled).toBe(true);
    expect(decision.actions.update.grantedBy).toHaveLength(1);
    expect(decision.actions.update.grantedBy[0]).toEqual({ type: 'relation', relation: 'owner' });

    // Delete same
    expect(decision.actions.delete.enabled).toBe(true);
    expect(decision.actions.delete.grantedBy).toHaveLength(1);
    expect(decision.actions.delete.grantedBy[0]).toEqual({ type: 'relation', relation: 'owner' });
  });

  it('attributes unconditional grants to membership (not relation)', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: userId,
    };
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId });

    // Create is unconditional 1 → membership grant
    expect(decision.actions.create.grantedBy).toHaveLength(1);
    expect(decision.actions.create.grantedBy[0]).toEqual({
      type: 'membership',
      contextType: 'organization',
      contextId: 'org1',
      role: 'member',
    });
  });

  it('does not attribute own grants when ownership check fails', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: 'user-other', // Not the actor
    };
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId });

    // Update/delete denied — no grants at all
    expect(decision.actions.update.enabled).toBe(false);
    expect(decision.actions.update.grantedBy).toHaveLength(0);
    expect(decision.actions.delete.enabled).toBe(false);
    expect(decision.actions.delete.grantedBy).toHaveLength(0);
  });

  it('admin gets membership grant (not relation) even with createdBy set', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'admin', userId }),
    ];
    const subject: SubjectForPermission = {
      entityType: 'attachment',
      id: 'att1',
      organizationId: 'org1',
      createdBy: 'user-other',
    };
    const decision = getAllDecisions(ownPolicies, memberships, subject, { userId });

    // Admin policy is unconditional 1, so grant is membership-based
    expect(decision.actions.update.enabled).toBe(true);
    expect(decision.actions.update.grantedBy[0]).toEqual({
      type: 'membership',
      contextType: 'organization',
      contextId: 'org1',
      role: 'admin',
    });
  });
});

describe('own permission — batch subjects', () => {
  const ownPolicies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  });

  const userId = 'user-actor';

  it('correctly evaluates mixed ownership in batch', () => {
    const memberships: TestMembership[] = [
      createTestMembership({ contextType: 'organization', organizationId: 'org1', role: 'member', userId }),
    ];
    const subjects: SubjectForPermission[] = [
      { entityType: 'attachment', id: 'att-own', organizationId: 'org1', createdBy: userId },
      { entityType: 'attachment', id: 'att-other', organizationId: 'org1', createdBy: 'user-other' },
      { entityType: 'attachment', id: 'att-null', organizationId: 'org1', createdBy: null },
    ];

    const results = getAllDecisions(ownPolicies, memberships, subjects, { userId });

    // Own entity — full access via ownership
    const ownDecision = results.get('att-own')!;
    expect(ownDecision.can.update).toBe(true);
    expect(ownDecision.can.delete).toBe(true);

    // Other's entity — denied
    const otherDecision = results.get('att-other')!;
    expect(otherDecision.can.update).toBe(false);
    expect(otherDecision.can.delete).toBe(false);

    // Null createdBy — denied
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
