import { appConfig } from '../src/config-builder/app-config.ts';
import { configurePermissions } from '../src/permissions/policy-matrix.ts';

// Access policies per entity type: `1` = allowed, `0`/omitted = denied. Elevation vs. self rows,
// product home rows, publicRead and row conditions are all explained in cella/PERMISSIONS.md.

/**
 * Roles whose grants cover every row physically below their channel, not only rows homed at that
 * channel level. Static per role, never per-row. `undefined` keeps every grant subtree-scoped. Read
 * by the engine check, the collection-scope SQL compiler and SSE dispatch, which must stay
 * mirror-consistent.
 *
 * @see cella/PERMISSIONS.md
 */
export const elevatedRoles: readonly string[] | undefined = undefined;

export const { policyMatrix, publicReadGrants } = configurePermissions(
  appConfig.entityTypes,
  ({ entityType, channels }) => {
    switch (entityType) {
      case 'organization':
        // self (this organization): create is inert here: org creation is gated by tenant quota, not this policy
        channels.organization.admin({ read: 1, update: 1, delete: 1 });
        channels.organization.member({ read: 1, update: 0, delete: 0 });
        break;
      case 'attachment':
        channels.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
        // 'own': members manage what they created; admins manage everything
        channels.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
        break;
    }
  },
);
