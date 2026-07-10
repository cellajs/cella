import { appConfig } from '../src/config-builder/app-config';
import { configurePermissions } from '../src/permissions/access-policies';

/**
 * Access policies for each entity type.
 *
 * Policies define CRUD permissions per role within each context.
 * Values: `1` = allowed, `0` = denied. Any action you omit defaults to `0` (denied), so a row
 * only needs to list the actions it grants.
 *
 * ## Elevation vs. self rows (context entities)
 *
 * For a context entity (organization, workspace, project), its policy has two kinds of rows:
 * - **elevation** rows on an *ancestor* context (e.g. `organization.*` under `project`): what a
 *   member of the parent can do to children. `create` lives here — it grants making the child.
 * - **self** rows on the *same* context (e.g. `project.*` under `project`): what a member of the
 *   entity can do to that entity. `create` is omitted on self rows because you can't create an
 *   entity from inside itself.
 *
 * Product entities have no self rows: their context rows are *home* rows, where `create` is
 * meaningful (it grants creating the product inside that context).
 *
 * Beyond plain cells, the builder callback also exposes:
 * - `publicRead(mode)` — declare how the subject becomes publicly readable (requires a matching
 *   `publicRead` declaration in the hierarchy config)
 * - row conditions like `read: 'own'` — grant an action only on rows the user created
 *
 * ## Adding new entities
 *
 * Defining access policies (a `case` in the switch below) is only one step of adding an entity.
 * For the full end-to-end recipe — hierarchy declaration, config arrays, DB table + RLS, module
 * wiring, sync engine, and frontend registration — see `cella/ADD_ENTITY.md`.
 */
export const { accessPolicies, publicReadGrants, rowRestrictions } = configurePermissions(
  appConfig.entityTypes,
  ({ subject, contexts }) => {
    switch (subject.name) {
      case 'organization':
        // self (this organization) — create is inert here: org creation is gated by tenant quota, not this policy
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
