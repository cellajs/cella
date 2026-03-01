/**
 * Entity hierarchy and role registry definitions.
 * Separated from default-config.ts to enable type inference before config object creation.
 */
import { createEntityHierarchy, createRoleRegistry } from './src/builder/entity-hierarchy';

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
 * Public actions define which actions (e.g., 'read') are allowed without authentication.
 * There is no cascading between contexts — each context must declare its own publicActions.
 * - Context entities can be public action sources (e.g., project with publicActions: ['read'])
 * - Product entities can either declare publicActions directly (standalone) or inherit from a parent context
 * - Inherited means the product is public only when its parent context is public
 * - Entities without publicActions are always private
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .product('page', { parent: null, publicActions: ['read'] })
  .build();
