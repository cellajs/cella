/**
 * Entity hierarchy and role registry definitions.
 * Separated from default-config.ts to enable type inference before config object creation.
 */
import { createEntityHierarchy, createRoleRegistry } from './src/config-builder/entity-hierarchy';

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
 * publicRead declares how an entity becomes publicly readable:
 * - 'always': Always publicly readable, no runtime check needed (e.g., published pages)
 * - 'publicSelf': Public when own publicAt timestamp is set
 * - 'publicParent': Public when parent context's publicAt is set
 * - 'publicParentOrSelf': Public when either own or parent's publicAt is set
 * Entities without publicRead are always private.
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .product('page', { parent: null, publicRead: 'always' })
  .build();
