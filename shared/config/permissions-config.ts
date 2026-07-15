import { appConfig } from '../src/config-builder/app-config';
import { configurePermissions } from '../src/permissions/access-policies';

/**
 * Access policies for each entity type.
 *
 * Policies define CRUD permissions per role within each context.
 * Values: `1` = allowed, `0` = denied. Any action you omit defaults to `0` (denied), so a row
 * only needs to list the actions it grants.
 *
 * ## Elevation vs. self rows (channel entities)
 *
 * For a channel entity (organization, workspace, project), its policy has two kinds of rows:
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
 * - `publicRead(mode)` — declare how the subject becomes publicly readable. Public readability is
 *   purely a permission concern; it is NOT declared in the hierarchy config. A `publicParent` mode
 *   does require the parent subject to be publicly readable itself (validated at boot).
 * - row conditions like `read: 'own'` — grant an action only on rows the user created
 *
 * ## Adding new entities
 *
 * Defining access policies (a `case` in the switch below) is only one step of adding an entity.
 * For the full end-to-end recipe — hierarchy declaration, config arrays, DB table + RLS, module
 * wiring, sync engine, and frontend registration — see `cella/ADD_ENTITY.md`.
 */
/**
 * Grant scoping for PRODUCT entities (optional). When a role list is configured, a
 * product membership grant of a role NOT in the list speaks only for rows HOMED at its
 * own context level — e.g. in a fork with `organization > course > project` chains, a
 * course `student` grant covers course-homed rows but not rows in the projects below,
 * while listed roles (typically staff/admin) keep full subtree scope (moderation
 * cascade, admin oversight). Context-entity subjects are exempt, so discovery of child
 * contexts is unaffected. Applies to every action, including `create` and `'own'`
 * conditions.
 *
 * This is a static, type-level visibility knob — one role set instead of per-row
 * audience data — evaluated identically by the engine check
 * (`getAllDecisions`) and the collection-scope SQL compiler
 * (`resolveCollectionReadFilter`), so both stay mirror-consistent.
 *
 * `undefined` (the template default) keeps every grant subtree-scoped — the current
 * behavior. A fork with nested contexts and elevated roles enables it like:
 *
 *   export const elevatedRoles = ['admin', 'staff'] as const;
 */
export const elevatedRoles: readonly string[] | undefined = undefined;

export const { accessPolicies, publicReadGrants } = configurePermissions(
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
