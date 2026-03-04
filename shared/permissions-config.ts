import { appConfig } from './app-config';
import { configureAccessPolicies } from './src/permissions/access-policies';

/**
 * Access policies for each entity type.
 *
 * Policies define CRUD permissions per role within each context.
 * Values:
 * - `1` = allowed (unconditional)
 * - `0` = denied
 * - `'own'` = allowed only when the actor is the entity's creator (implicit "owner" relation).
 *   The permission engine checks `entity.createdBy === userId` at evaluation time.
 *   On the frontend, use `resolvePermission()` to resolve `'own'` per-entity.
 *
 * ## Adding new entities
 *
 * 1. Add entity to appConfig.entityConfig with kind, parent/ancestors, and roles (for context)
 * 2. Add entity type to appConfig.entityTypes array
 * 3. Define access policies in the switch statement below (use `'own'` for ownership-scoped actions)
 * 4. Create DB schema in `backend/src/db/schema/`
 * 5. Run `pnpm generate` to create migrations
 */
export const accessPolicies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
  switch (subject.name) {
    case 'organization':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
      break;
    case 'attachment':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 'own', delete: 'own' });
      break;
    case 'page':
      break;
  }
});
