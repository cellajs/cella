// Split from config.default.ts so its types can be inferred before the config object is built.
import { createEntityHierarchy, createRoleRegistry } from '../src/config-builder/entity-hierarchy';

/** Single source of truth for all entity roles used in memberships and permissions. */
export const roles = createRoleRegistry(['admin', 'member'] as const);

/**
 * Entity relationships, single-parent inheritance. Parents before children; order sets the ancestor
 * chain. Products may add `relatedChannels` (non-ancestor context refs, nullable id columns). Public
 * readability is a permission concern, not declared here — see cella/PERMISSIONS.md for the model.
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  .channel('organization', { parent: null, roles: roles.all })
  .product('attachment', { parent: 'organization' })
  .build();
