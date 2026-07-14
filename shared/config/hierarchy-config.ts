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
 * Optional `relatedChannels` on products declare non-ancestor context references (nullable id columns).
 *
 * Public readability is NOT declared here — it is a permission concern, declared per
 * subject via `publicRead(mode)` in `permissions-config.ts`.
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .channel('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .build();

/**
 * Example hierarchy from raak.dev (roles registry: ['admin', 'member', 'guest']):
 *
 * createEntityHierarchy(roles)
 *   .user()
 *   .channel('organization', { parent: null, roles: ['admin', 'member'] })
 *   .channel('workspace', { parent: 'organization', roles: roles.all })
 *   .channel('project', { parent: 'organization', roles: roles.all })
 *   .product('task', { parent: 'project' })
 *   .product('label', { parent: 'project' })
 *   .product('attachment', { parent: 'project' })
 *   .build();
 *
 * Public read grants for these entities (e.g. project 'publicSelf', task 'publicParent')
 * are declared in `permissions-config.ts` via `publicRead(mode)`.
 */
