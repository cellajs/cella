import { appConfig } from 'config';
import { describe, expect, it } from 'vitest';
import { configureAccessPolicies } from './access-policies';
import { checkAllPermissions } from './check';
import {
  createContext,
  createHierarchy,
  createProduct,
  getAncestorContexts,
  getContextRoles,
  isContextEntity,
  isProductEntity,
} from './hierarchy';
import type { HierarchyConfig, MembershipForPermission, SubjectForPermission } from './types';

/**
 * Standard hierarchy matching Cella's default config.
 * organization is the only context entity, attachment and page are product entities.
 */
const hierarchy = createHierarchy({
  organization: createContext(appConfig.roles.entityRoles),
  attachment: createProduct(['organization']),
  page: createProduct(['organization']),
} as HierarchyConfig);

describe('hierarchy', () => {
  describe('createContext', () => {
    it('creates context config without parents', () => {
      const config = createContext(['admin', 'member']);
      expect(config).toEqual({
        type: 'context',
        roles: ['admin', 'member'],
        parents: undefined,
      });
    });

    it('creates context config with parents', () => {
      const config = createContext(['admin', 'member'], ['organization']);
      expect(config).toEqual({
        type: 'context',
        roles: ['admin', 'member'],
        parents: ['organization'],
      });
    });
  });

  describe('createProduct', () => {
    it('creates product config with parents', () => {
      const config = createProduct(['organization']);
      expect(config).toEqual({
        type: 'product',
        parents: ['organization'],
      });
    });
  });

  describe('getAncestorContexts', () => {
    it('returns empty array for root context', () => {
      const ancestors = getAncestorContexts(hierarchy, 'organization');
      expect(ancestors).toEqual([]);
    });

    it('returns direct parent for product entity', () => {
      const ancestors = getAncestorContexts(hierarchy, 'attachment');
      expect(ancestors).toContain('organization');
    });

    it('returns direct parent for page entity', () => {
      const ancestors = getAncestorContexts(hierarchy, 'page');
      expect(ancestors).toContain('organization');
    });
  });

  describe('getContextRoles', () => {
    it('returns roles for context entity', () => {
      const roles = getContextRoles(hierarchy, 'organization');
      expect(roles).toEqual(appConfig.roles.entityRoles);
    });
  });

  describe('isContextEntity / isProductEntity', () => {
    it('correctly identifies context entities', () => {
      expect(isContextEntity(hierarchy, 'organization')).toBe(true);
      expect(isContextEntity(hierarchy, 'attachment')).toBe(false);
      expect(isContextEntity(hierarchy, 'page')).toBe(false);
      expect(isContextEntity(hierarchy, 'user')).toBe(false);
    });

    it('correctly identifies product entities', () => {
      expect(isProductEntity(hierarchy, 'attachment')).toBe(true);
      expect(isProductEntity(hierarchy, 'page')).toBe(true);
      expect(isProductEntity(hierarchy, 'organization')).toBe(false);
      expect(isProductEntity(hierarchy, 'user')).toBe(false);
    });
  });
});

describe('configureAccessPolicies', () => {
  it('configures policies for all entity types', () => {
    const policies = configureAccessPolicies(hierarchy, appConfig.entityTypes, ({ subject, contexts }) => {
      switch (subject.name) {
        case 'organization':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
          contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0, search: 1 });
          break;
        case 'attachment':
          contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
          contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0, search: 1 });
          break;
      }
    });

    expect(policies.organization).toBeDefined();
    expect(policies.organization).toHaveLength(2);
    expect(policies.attachment).toBeDefined();
    expect(policies.attachment).toHaveLength(2);
  });

  it('creates empty policies when no config is set', () => {
    const policies = configureAccessPolicies(hierarchy, appConfig.entityTypes, () => {
      // No configuration
    });

    expect(policies.organization).toBeUndefined();
  });
});

describe('checkPermission', () => {
  const policies = configureAccessPolicies(hierarchy, appConfig.entityTypes, ({ subject, contexts }) => {
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

  it('grants full permissions for admin on organization', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'admin' },
    ];
    const subject: SubjectForPermission = { entityType: 'organization', id: 'org1', organizationId: 'org1' };
    const { can } = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(true);
    expect(can.delete).toBe(true);
  });

  it('grants limited permissions for member on organization', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'organization', id: 'org1', organizationId: 'org1' };
    const { can } = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(can.create).toBe(false);
    expect(can.read).toBe(true);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('grants create permission for member on attachment', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });

  it('grants more permissions for member on page than attachment', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const pageSubject: SubjectForPermission = { entityType: 'page', id: 'page1', organizationId: 'org1' };
    const { can } = checkAllPermissions(hierarchy, policies, memberships, pageSubject);

    expect(can.create).toBe(true);
    expect(can.read).toBe(true);
    expect(can.update).toBe(true);
    expect(can.delete).toBe(false);
  });

  it('denies access when no matching membership', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org2', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(can.create).toBe(false);
    expect(can.read).toBe(false);
    expect(can.update).toBe(false);
    expect(can.delete).toBe(false);
  });
});

describe('permission inheritance from organization context', () => {
  const policies = configureAccessPolicies(hierarchy, appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
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

  it('admin can delete attachments', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'admin' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(can.delete).toBe(true);
  });

  it('member cannot delete attachments', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const { can } = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(can.delete).toBe(false);
  });

  it('member can update pages but not attachments', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];

    const attachmentSubject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const pageSubject: SubjectForPermission = { entityType: 'page', id: 'page1', organizationId: 'org1' };
    const attachmentResult = checkAllPermissions(hierarchy, policies, memberships, attachmentSubject);
    const pageResult = checkAllPermissions(hierarchy, policies, memberships, pageSubject);

    expect(attachmentResult.can.update).toBe(false);
    expect(pageResult.can.update).toBe(true);
  });
});

describe('PermissionDecision action attribution', () => {
  const policies = configureAccessPolicies(hierarchy, appConfig.entityTypes, ({ subject, contexts }) => {
    switch (subject.name) {
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0, search: 1 });
        break;
    }
  });

  it('returns action attribution with grantedBy details', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = checkAllPermissions(hierarchy, policies, memberships, subject);

    // Check actions structure exists
    expect(decision.actions).toBeDefined();
    expect(decision.actions.create).toBeDefined();
    expect(decision.actions.read).toBeDefined();

    // Member can create - should have grantedBy entry
    expect(decision.actions.create.enabled).toBe(true);
    expect(decision.actions.create.grantedBy).toHaveLength(1);
    expect(decision.actions.create.grantedBy[0]).toEqual({
      contextType: 'organization',
      contextId: 'org1',
      role: 'member',
    });

    // Member cannot delete - should have empty grantedBy
    expect(decision.actions.delete.enabled).toBe(false);
    expect(decision.actions.delete.grantedBy).toHaveLength(0);
  });

  it('returns subject context IDs for debugging', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(decision.subject.entityType).toBe('attachment');
    expect(decision.subject.id).toBe('att1');
    expect(decision.subject.contextIds).toEqual({ organization: 'org1' });
  });

  it('returns relevantContexts and primaryContext', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = checkAllPermissions(hierarchy, policies, memberships, subject);

    expect(decision.relevantContexts).toEqual(['organization']);
    expect(decision.primaryContext).toBe('organization');
  });

  it('accumulates multiple grants for same action from different roles', () => {
    const memberships: MembershipForPermission[] = [
      { contextType: 'organization', organizationId: 'org1', role: 'admin' },
      { contextType: 'organization', organizationId: 'org1', role: 'member' },
    ];
    const subject: SubjectForPermission = { entityType: 'attachment', id: 'att1', organizationId: 'org1' };
    const decision = checkAllPermissions(hierarchy, policies, memberships, subject);

    // Both admin and member grant read permission
    expect(decision.actions.read.enabled).toBe(true);
    expect(decision.actions.read.grantedBy).toHaveLength(2);
    expect(decision.actions.read.grantedBy).toContainEqual({
      contextType: 'organization',
      contextId: 'org1',
      role: 'admin',
    });
    expect(decision.actions.read.grantedBy).toContainEqual({
      contextType: 'organization',
      contextId: 'org1',
      role: 'member',
    });

    // Only admin grants delete permission
    expect(decision.actions.delete.enabled).toBe(true);
    expect(decision.actions.delete.grantedBy).toHaveLength(1);
    expect(decision.actions.delete.grantedBy[0].role).toBe('admin');
  });
});
