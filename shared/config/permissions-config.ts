import { appConfig } from '../src/config-builder/app-config';
import { configurePermissions } from '../src/permissions/access-policies';

// Access policies per entity type: `1` = allowed, `0`/omitted = denied. Elevation vs. self rows,
// product home rows, publicRead and row conditions are all explained in cella/PERMISSIONS.md.

/**
 * Optional product grant scoping: roles NOT in this list see only rows homed at their own context
 * level; listed roles keep full subtree scope. `undefined` keeps every grant subtree-scoped.
 * Read by the engine and the collection-scope SQL compiler alike.
 *
 * @see cella/PERMISSIONS.md
 */
export const elevatedRoles: readonly string[] | undefined = undefined;

export const { accessPolicies, publicReadGrants } = configurePermissions(
  appConfig.entityTypes,
  ({ subject, contexts }) => {
    switch (subject.name) {
      case 'organization':
        // self (this organization): create is inert here: org creation is gated by tenant quota, not this policy
        contexts.organization.admin({ read: 1, update: 1, delete: 1 });
        contexts.organization.member({ read: 1, update: 0, delete: 0 });
        break;
      case 'attachment':
        contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        contexts.organization.member({ create: 1, read: 1, update: 0, delete: 0 });
        break;
    }
  },
);
