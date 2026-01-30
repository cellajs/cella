import { describe, expect, it } from 'vitest';
import { createEntityHierarchy, createRoleRegistry } from './entity-hierarchy';

describe('EntityHierarchyBuilder', () => {
  const roles = createRoleRegistry(['admin', 'member', 'guest'] as const);

  describe('createRoleRegistry', () => {
    it('creates registry with all roles and individual accessors', () => {
      expect(roles.all).toEqual(['admin', 'member', 'guest']);
      expect(roles.admin).toBe('admin');
      expect(roles.member).toBe('member');
      expect(roles.guest).toBe('guest');
    });

    it('freezes the registry', () => {
      expect(Object.isFrozen(roles)).toBe(true);
    });
  });

  describe('builder validation', () => {
    it('throws if user() not called before build()', () => {
      expect(() => {
        createEntityHierarchy(roles).context('organization', { parent: null, roles: roles.all }).build();
      }).toThrow('user() must be called before build()');
    });

    it('throws if organization context is missing', () => {
      expect(() => {
        createEntityHierarchy(roles).user().context('workspace', { parent: null, roles: roles.all }).build();
      }).toThrow('organization context is required');
    });

    it('throws on duplicate entity name', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          .context('organization', { parent: null, roles: roles.all })
          .context('organization', { parent: null, roles: roles.all });
      }).toThrow('entity "organization" already defined');
    });

    it('throws on unknown parent reference', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          .context('organization', { parent: null, roles: roles.all })
          // @ts-expect-error - Testing runtime validation
          .product('task', { parent: 'project' });
      }).toThrow('references unknown parent "project"');
    });

    it('throws if parent is not a context entity', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          .context('organization', { parent: null, roles: roles.all })
          .product('attachment', { parent: 'organization' })
          // @ts-expect-error - Testing runtime validation
          .product('file', { parent: 'attachment' });
      }).toThrow('must be a context entity');
    });

    it('throws on invalid role', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          // @ts-expect-error - Testing runtime validation
          .context('organization', { parent: null, roles: ['admin', 'superuser'] });
      }).toThrow('invalid role "superuser"');
    });

    it('throws on empty roles array', () => {
      expect(() => {
        createEntityHierarchy(roles).user().context('organization', { parent: null, roles: [] });
      }).toThrow('must have at least one role');
    });
  });

  describe('hierarchy queries (raak-like model)', () => {
    // Matches raak's entity structure:
    // - organization: root context
    // - workspace: context under organization (parallel to project)
    // - project: context under organization
    // - task, label, attachment: products scoped to project (inherit org permissions)
    // - page: global product (no parent)
    const hierarchy = createEntityHierarchy(roles)
      .user()
      .context('organization', { parent: null, roles: [roles.admin, roles.member] })
      .context('workspace', { parent: 'organization', roles: roles.all })
      .context('project', { parent: 'organization', roles: roles.all })
      .product('task', { parent: 'project' })
      .product('label', { parent: 'project' })
      .product('attachment', { parent: 'project' }) // Scoped to project, inherits org
      .product('page', { parent: null })
      .build();

    it('getKind returns correct kind', () => {
      expect(hierarchy.getKind('user')).toBe('user');
      expect(hierarchy.getKind('organization')).toBe('context');
      expect(hierarchy.getKind('task')).toBe('product');
      expect(hierarchy.getKind('unknown')).toBeUndefined();
    });

    it('isContext returns true only for context entities', () => {
      expect(hierarchy.isContext('organization')).toBe(true);
      expect(hierarchy.isContext('project')).toBe(true);
      expect(hierarchy.isContext('task')).toBe(false);
      expect(hierarchy.isContext('user')).toBe(false);
    });

    it('isProduct returns true only for product entities', () => {
      expect(hierarchy.isProduct('task')).toBe(true);
      expect(hierarchy.isProduct('attachment')).toBe(true);
      expect(hierarchy.isProduct('organization')).toBe(false);
    });

    it('getRoles returns roles for context entities', () => {
      expect(hierarchy.getRoles('organization')).toEqual(['admin', 'member']);
      expect(hierarchy.getRoles('project')).toEqual(['admin', 'member', 'guest']);
      expect(hierarchy.getRoles('task')).toEqual([]);
    });

    it('getParent returns correct parent', () => {
      expect(hierarchy.getParent('organization')).toBe(null);
      expect(hierarchy.getParent('workspace')).toBe('organization');
      expect(hierarchy.getParent('project')).toBe('organization');
      expect(hierarchy.getParent('task')).toBe('project');
      expect(hierarchy.getParent('label')).toBe('project');
      expect(hierarchy.getParent('attachment')).toBe('project');
      expect(hierarchy.getParent('page')).toBe(null);
      expect(hierarchy.getParent('user')).toBe(null);
    });

    it('getOrderedAncestors returns ancestors most-specific first', () => {
      // task → project → organization (inherits permissions from both)
      expect(hierarchy.getOrderedAncestors('task')).toEqual(['project', 'organization']);
      // label → project → organization
      expect(hierarchy.getOrderedAncestors('label')).toEqual(['project', 'organization']);
      // attachment → project → organization (key: gets BOTH ancestors via parent chain)
      expect(hierarchy.getOrderedAncestors('attachment')).toEqual(['project', 'organization']);
      // page → [] (global, no ancestors)
      expect(hierarchy.getOrderedAncestors('page')).toEqual([]);
      // workspace → organization
      expect(hierarchy.getOrderedAncestors('workspace')).toEqual(['organization']);
      // project → organization
      expect(hierarchy.getOrderedAncestors('project')).toEqual(['organization']);
      // organization → [] (root)
      expect(hierarchy.getOrderedAncestors('organization')).toEqual([]);
    });

    it('hasAncestor checks ancestor chain', () => {
      expect(hierarchy.hasAncestor('task', 'project')).toBe(true);
      expect(hierarchy.hasAncestor('task', 'organization')).toBe(true);
      expect(hierarchy.hasAncestor('task', 'workspace')).toBe(false); // Different branch
      // Attachment now has both project and organization as ancestors
      expect(hierarchy.hasAncestor('attachment', 'project')).toBe(true);
      expect(hierarchy.hasAncestor('attachment', 'organization')).toBe(true);
      // Page is global - no ancestors
      expect(hierarchy.hasAncestor('page', 'organization')).toBe(false);
    });

    it('contextTypes and productTypes are correct', () => {
      expect(hierarchy.contextTypes).toContain('organization');
      expect(hierarchy.contextTypes).toContain('workspace');
      expect(hierarchy.contextTypes).toContain('project');
      expect(hierarchy.productTypes).toContain('task');
      expect(hierarchy.productTypes).toContain('label');
      expect(hierarchy.productTypes).toContain('attachment');
      expect(hierarchy.productTypes).toContain('page');
    });

    it('relatableContextTypes contains only context parents of products', () => {
      // project is parent of task, label, attachment
      expect(hierarchy.relatableContextTypes).toContain('project');
      // organization and workspace are NOT direct parents of any product
      expect(hierarchy.relatableContextTypes).not.toContain('organization');
      expect(hierarchy.relatableContextTypes).not.toContain('workspace');
      // page has null parent, so no context added
      expect(hierarchy.relatableContextTypes).toHaveLength(1);
    });

    it('allTypes includes all entities', () => {
      expect(hierarchy.allTypes).toContain('user');
      expect(hierarchy.allTypes).toContain('organization');
      expect(hierarchy.allTypes).toContain('project');
      expect(hierarchy.allTypes).toContain('task');
    });
  });
});
