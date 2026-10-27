import { createEntityHierarchy, createRoleRegistry } from '../src/config-builder/entity-hierarchy.ts';

/** Single source of truth for all entity roles used in memberships and permissions. */
export const roles = createRoleRegistry(['admin', 'member'] as const);

/**
 * Entity relationships, single-parent inheritance. The organization is the spine (`organization()`,
 * the only parentless entity); parents before children, and order sets the ancestor chain. Products
 * may add `relatedChannels` (non-ancestor channel refs, nullable id columns). Public readability is
 * a permission concern, not declared here. Channels may add `elevated` (roles whose product grants
 * cover the whole subtree, compiled into `hierarchy.elevatedGrants`) and `drafts` (the channel can
 * start unpublished; `prepareRoles` are invited at once, the rest when it is published); channels below
 * the organization may add `organizationRoles` (the complete escalation map for auto-created
 * organization membership rows). Declared apart from config.default.ts so its types are inferred before the config
 * object is built.
 *
 * @see cella/PERMISSIONS.md
 */
export const hierarchy = createEntityHierarchy(roles)
  .user()
  // Only org admins are elevated: their product grants reach rows homed anywhere in the org, a member's
  // only rows homed at the organization. Elevating a role that a sub-channel's `organizationRoles` maps to
  // gives every member of that sub-channel the role's product grants in all its siblings.
  .organization({ roles: roles.all, elevated: ['admin'], drafts: { prepareRoles: ['admin'] } })
  .product('attachment', { parent: 'organization' })
  .build();
