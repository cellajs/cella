import { appConfig } from '../src/config-builder/app-config';
import { configureAccessPolicies } from '../src/permissions/access-policies';

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
 * ## Adding new entities
 *
 * 1. Add entity to appConfig.entityConfig with kind, parent/ancestors, and roles (for context)
 * 2. Add entity type to appConfig.entityTypes array
 * 3. Define access policies in the switch statement below
 * 4. Create DB schema in `backend/src/db/schema/`
 * 5. Run `pnpm generate` to create migrations
 */
export const accessPolicies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
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
});
