/**
 * Entity hierarchy and role registry definitions.
 * Separated from default-config.ts to enable type inference before config object creation.
 */
import { createEntityHierarchy, createRoleRegistry } from '../src/config-builder/entity-hierarchy';

/******************************************************************************
 * ROLE REGISTRY
 ******************************************************************************/

/**
 * Single source of truth for all entity roles used in memberships and permissions.
 */
export const roles = createRoleRegistry(['admin', 'member'] as const);

/******************************************************************************
 * ENTITY HIERARCHY
 ******************************************************************************/

/**
 * Entity relationships with single-parent inheritance.
 * Parents are defined before children. Order determines ancestor chain.
 *
 * Optional `relatedContexts` on products declare non-ancestor context references (nullable id columns).
 *
 * publicRead declares how an entity becomes publicly readable:
 * - 'publicSelf': Public when own publicAt timestamp is set
 * - 'publicParent': Public when parent context's publicAt is set
 * - 'publicParentOrSelf': Public when either own or parent's publicAt is set
 * Entities without publicRead are always private.
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .build();

/**
 * Example hierarchy from raak.dev:
 *
 * createEntityHierarchy(roles)
 *   .user()
 *   .context('organization', { parent: null, roles: ['admin', 'member'] })
 *   .context('workspace', { parent: 'organization', roles: roles.all })
 *   .context('project', { parent: 'organization', roles: roles.all, publicRead: 'publicSelf' })
 *   .product('task', { parent: 'project', publicRead: 'publicParent' })
 *   .product('label', { parent: 'project' })
 *   .product('attachment', { parent: 'project', publicRead: 'publicParent' })
 *   .product('chat', { parent: 'organization', relatedContexts: ['project', 'workspace'] })
 *   .product('message', { parent: 'organization', relatedContexts: ['project', 'workspace'] })
 *   .build();
 */
