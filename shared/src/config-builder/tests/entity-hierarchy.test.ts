import { describe, expect, it } from 'vitest';
import { createEntityHierarchy, createRoleRegistry } from '../entity-hierarchy.ts';

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
        createEntityHierarchy(roles).channel('organization', { parent: null, roles: roles.all }).build();
      }).toThrow('user() must be called before build()');
    });

    it('throws if organization channel is missing', () => {
      expect(() => {
        createEntityHierarchy(roles).user().channel('workspace', { parent: null, roles: roles.all }).build();
      }).toThrow('organization channel is required');
    });

    it('throws on duplicate entity name', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          .channel('organization', { parent: null, roles: roles.all })
          .channel('organization', { parent: null, roles: roles.all });
      }).toThrow('entity "organization" already defined');
    });

    it('throws on unknown parent reference', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          .channel('organization', { parent: null, roles: roles.all })
          // @ts-expect-error - Testing runtime validation
          .product('task', { parent: 'project' });
      }).toThrow('references unknown parent "project"');
    });

    it('throws if parent is not a channel entity', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          .channel('organization', { parent: null, roles: roles.all })
          .product('attachment', { parent: 'organization' })
          // @ts-expect-error - Testing runtime validation
          .product('file', { parent: 'attachment' });
      }).toThrow('must be a channel entity');
    });

    it('throws on invalid role', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          // @ts-expect-error - Testing runtime validation
          .channel('organization', { parent: null, roles: ['admin', 'superuser'] });
      }).toThrow('invalid role "superuser"');
    });

    it('throws on empty roles array', () => {
      expect(() => {
        createEntityHierarchy(roles).user().channel('organization', { parent: null, roles: [] });
      }).toThrow('must have at least one role');
    });

    it('throws if a product has no parent', () => {
      expect(() => {
        createEntityHierarchy(roles)
          .user()
          .channel('organization', { parent: null, roles: roles.all })
          // @ts-expect-error - Testing runtime validation (parent is required at the type level)
          .product('page', { parent: null });
      }).toThrow('has no parent');
    });
  });

  describe('hierarchy queries (raak-like model)', () => {
    // Model organization as root; workspace and project as its channels.
    // Task, label, and attachment are project products inheriting organization permissions.
    const hierarchy = createEntityHierarchy(roles)
      .user()
      .channel('organization', { parent: null, roles: [roles.admin, roles.member] })
      .channel('workspace', { parent: 'organization', roles: roles.all })
      .channel('project', { parent: 'organization', roles: roles.all })
      .product('task', { parent: 'project' })
      .product('label', { parent: 'project' })
      .product('attachment', { parent: 'project' }) // Scoped to project, inherits org
      .build();

    it('getKind returns correct kind', () => {
      expect(hierarchy.getKind('user')).toBe('user');
      expect(hierarchy.getKind('organization')).toBe('channel');
      expect(hierarchy.getKind('task')).toBe('product');
      expect(hierarchy.getKind('unknown')).toBeUndefined();
    });

    it('isChannel returns true only for channel entities', () => {
      expect(hierarchy.isChannel('organization')).toBe(true);
      expect(hierarchy.isChannel('project')).toBe(true);
      expect(hierarchy.isChannel('task')).toBe(false);
      expect(hierarchy.isChannel('user')).toBe(false);
    });

    it('isProduct returns true only for product entities', () => {
      expect(hierarchy.isProduct('task')).toBe(true);
      expect(hierarchy.isProduct('attachment')).toBe(true);
      expect(hierarchy.isProduct('organization')).toBe(false);
    });

    it('getRoles returns roles for channel entities', () => {
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
      expect(hierarchy.getParent('user')).toBe(null);
    });

    it('getOrderedAncestors returns ancestors most-specific first', () => {
      expect(hierarchy.getOrderedAncestors('task')).toEqual(['project', 'organization']);
      expect(hierarchy.getOrderedAncestors('label')).toEqual(['project', 'organization']);
      expect(hierarchy.getOrderedAncestors('attachment')).toEqual(['project', 'organization']);
      expect(hierarchy.getOrderedAncestors('workspace')).toEqual(['organization']);
      expect(hierarchy.getOrderedAncestors('project')).toEqual(['organization']);
      expect(hierarchy.getOrderedAncestors('organization')).toEqual([]);
    });

    it('hasAncestor checks ancestor chain', () => {
      expect(hierarchy.hasAncestor('task', 'project')).toBe(true);
      expect(hierarchy.hasAncestor('task', 'organization')).toBe(true);
      expect(hierarchy.hasAncestor('task', 'workspace')).toBe(false); // Different branch
      expect(hierarchy.hasAncestor('attachment', 'project')).toBe(true);
      expect(hierarchy.hasAncestor('attachment', 'organization')).toBe(true);
    });

    it('channelTypes and productTypes are correct', () => {
      expect(hierarchy.channelTypes).toContain('organization');
      expect(hierarchy.channelTypes).toContain('workspace');
      expect(hierarchy.channelTypes).toContain('project');
      expect(hierarchy.productTypes).toContain('task');
      expect(hierarchy.productTypes).toContain('label');
      expect(hierarchy.productTypes).toContain('attachment');
    });

    it('relatableChannelTypes contains only channel parents of products', () => {
      expect(hierarchy.relatableChannelTypes).toContain('project');
      expect(hierarchy.relatableChannelTypes).not.toContain('organization');
      expect(hierarchy.relatableChannelTypes).not.toContain('workspace');
      expect(hierarchy.relatableChannelTypes).toHaveLength(1);
    });

    it('allTypes includes all entities', () => {
      expect(hierarchy.allTypes).toContain('user');
      expect(hierarchy.allTypes).toContain('organization');
      expect(hierarchy.allTypes).toContain('project');
      expect(hierarchy.allTypes).toContain('task');
    });
  });

  describe('nullable ancestors (variable-depth rows)', () => {
    const deep = () =>
      createEntityHierarchy(roles)
        .user()
        .channel('organization', { parent: null, roles: roles.all })
        .channel('course', { parent: 'organization', roles: roles.all })
        .channel('courseSection', { parent: 'course', roles: roles.all })
        .channel('project', { parent: 'courseSection', roles: roles.all });

    it('exposes declared nullable ancestors via accessor and product view', () => {
      const h = deep()
        .product('item', { parent: 'project', nullableAncestors: ['project', 'courseSection'] })
        .build();
      expect(h.getNullableAncestors('item')).toEqual(['project', 'courseSection']);
      expect(h.getProductConfig('item')?.nullableAncestors).toEqual(['project', 'courseSection']);
    });

    it('returns empty array when none declared', () => {
      const h = deep().product('item', { parent: 'project' }).build();
      expect(h.getNullableAncestors('item')).toEqual([]);
      expect(h.getNullableAncestors('course')).toEqual([]);
    });

    it('throws when a nullable ancestor is not in the ancestor chain', () => {
      expect(() =>
        createEntityHierarchy(roles)
          .user()
          .channel('organization', { parent: null, roles: roles.all })
          .channel('workspace', { parent: 'organization', roles: roles.all })
          .channel('project', { parent: 'organization', roles: roles.all })
          .product('task', { parent: 'project', nullableAncestors: ['workspace'] }),
      ).toThrow('is not an ancestor');
    });

    it('throws when the chain root is declared nullable', () => {
      expect(() => deep().product('item', { parent: 'project', nullableAncestors: ['organization'] })).toThrow(
        'chain root and must stay non-null',
      );
    });

    it('throws on duplicate nullable ancestors', () => {
      expect(() => deep().product('item', { parent: 'project', nullableAncestors: ['project', 'project'] })).toThrow(
        'duplicate nullableAncestor',
      );
    });
  });

  describe('rootRoles', () => {
    const base = () => createEntityHierarchy(roles).user().channel('organization', { parent: null, roles: roles.all });

    it('exposes the declared escalation map via getRootRole', () => {
      const h = base()
        .channel('workspace', {
          parent: 'organization',
          roles: ['member', 'guest'],
          rootRoles: { member: 'member', guest: 'guest' },
        })
        .build();
      expect(h.getRootRole('workspace', 'member')).toBe('member');
      expect(h.getRootRole('workspace', 'guest')).toBe('guest');
    });

    it('returns undefined for a channel without a map and for roles outside it', () => {
      const h = base()
        .channel('workspace', { parent: 'organization', roles: ['member'] })
        .build();
      expect(h.getRootRole('workspace', 'member')).toBeUndefined();
      expect(h.getRootRole('organization', 'admin')).toBeUndefined();
    });

    it('throws when the root channel declares a map (it has no root above it)', () => {
      expect(() =>
        createEntityHierarchy(roles)
          .user()
          .channel('organization', { parent: null, roles: roles.all, rootRoles: { admin: 'admin' } as never }),
      ).toThrow('cannot declare rootRoles');
    });

    it('throws when a declared map leaves one of the channel roles unmapped', () => {
      expect(() =>
        base().channel('workspace', {
          parent: 'organization',
          roles: ['member', 'guest'],
          rootRoles: { member: 'member' } as any,
        }),
      ).toThrow('leaves guest unmapped');
    });

    it('throws when a mapped value is not a role of the chain root', () => {
      expect(() =>
        base().channel('workspace', {
          parent: 'organization',
          roles: ['guest'],
          rootRoles: { guest: 'owner' } as any,
        }),
      ).toThrow('not a role of');
    });
  });

  describe('elevatedGrants', () => {
    it('compiles channel-qualified keys from each channel elevated list', () => {
      const h = createEntityHierarchy(roles)
        .user()
        .channel('organization', { parent: null, roles: roles.all, elevated: ['admin'] })
        .channel('workspace', { parent: 'organization', roles: ['member', 'guest'], elevated: ['member'] })
        .build();
      expect(h.elevatedGrants).toEqual(new Set(['organization:admin', 'workspace:member']));
    });

    it('compiles an empty set when no channel declares elevation', () => {
      const h = createEntityHierarchy(roles).user().channel('organization', { parent: null, roles: roles.all }).build();
      expect(h.elevatedGrants.size).toBe(0);
    });

    it('throws when an elevated role is not one of the channel roles', () => {
      expect(() =>
        createEntityHierarchy(roles)
          .user()
          .channel('organization', { parent: null, roles: ['admin'], elevated: ['owner'] as any }),
      ).toThrow('elevates unknown role');
    });
  });
});
