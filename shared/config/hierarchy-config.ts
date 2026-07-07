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
 * Optional `host` on products declares product-to-product ownership (nullable <host>Id column):
 * hosted rows cascade with their host and feed the host's e:<hosted> counter.
 *
 * Public readability is NOT declared here — it is a permission concern, declared per
 * subject via `publicRead(mode)` in `permissions-config.ts`.
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .context('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .build();

/**
 * Example hierarchy from raak.dev (roles registry: ['admin', 'member', 'guest']):
 *
 * createEntityHierarchy(roles)
 *   .user()
 *   .context('organization', { parent: null, roles: ['admin', 'member'] })
 *   .context('workspace', { parent: 'organization', roles: roles.all })
 *   .context('project', { parent: 'organization', roles: roles.all })
 *   .product('task', { parent: 'project' })
 *   .product('label', { parent: 'project' })
 *   // host: task-owned attachments (nullable taskId column) — deleting a task cascades
 *   // to them, and CDC maintains e:attachment counts per task. Unhosted attachments
 *   // (taskId null) live at project level.
 *   .product('attachment', { parent: 'project', host: 'task' })
 *   .build();
 *
 * Public read grants for these entities (e.g. project 'publicSelf', task 'publicParent')
 * are declared in `permissions-config.ts` via `publicRead(mode)`.
 */
