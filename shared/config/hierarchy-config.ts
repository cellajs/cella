// Split from config.default.ts so its types can be inferred before the config object is built.
import { createEntityHierarchy, createRoleRegistry } from '../src/config-builder/entity-hierarchy.ts';

/** Single source of truth for all entity roles used in memberships and permissions. */
export const roles = createRoleRegistry(['admin', 'member'] as const);

/**
 * Entity relationships, single-parent inheritance. Parents before children; order sets the ancestor
 * chain. Products may add `relatedChannels` (non-ancestor context refs, nullable id columns). Public
 * readability is a permission concern, not declared here. Channels may add `elevated` (roles whose
 * product grants cover the whole subtree, compiled into `hierarchy.elevatedGrants`); non-root
 * channels may add `rootRoles` (the complete escalation map for auto-created root membership rows).
 *
 * @see cella/PERMISSIONS.md
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  // Both org roles are elevated: their product grants cover the whole org subtree, which keeps
  // catchup/view proving org-wide. Apps adding sub-channels narrow this per channel and role.
  .channel('organization', { parent: null, roles: roles.all, elevated: roles.all })
  .product('attachment', { parent: 'organization' })
  .build();
