import { appConfig } from '../../app-config';
import { configureAccessPolicies } from './access-policies';

/**
 * Access policies for each entity type.
 *
 * Policies define CRUD + search permissions per role within each context.
 * Values: `1` = allowed, `0` = denied
 *
 * ## Adding new entities
 *
 * 1. Add entity to appConfig.entityConfig with kind, parent/ancestors, and roles (for context)
 * 2. Add entity type to appConfig.entityTypes array
 * 3. Define access policies in the switch statement below
 * 4. Create DB schema in `backend/src/db/schema/`
 * 5. Run `pnpm generate` to create migrations
 */
// TODO search doesnt make sense for product entities? Maybe need to split context vs product permissions
// TODO search is not actually implemented yet.
export const accessPolicies = configureAccessPolicies(appConfig.entityTypes, ({ subject, contexts }) => {
  switch (subject.name) {
    case 'organization':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
      contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0, search: 1 });
      break;
    case 'attachment':
      contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1, search: 1 });
      contexts.organization.member({ create: 1, read: 1, update: 0, delete: 1, search: 1 });
      break;
    case 'page':
      // No policies configured for pages
      break;
  }
});
