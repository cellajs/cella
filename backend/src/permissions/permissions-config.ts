import { appConfig } from 'config';
import { configureAccessPolicies, createContext, createHierarchy, createProduct } from './permission-manager';

/**
 * Define hierarchical structure for context entities with roles, and for product entities without roles.
 *
 * Adding a new entity here is the first step to configure its access policies.
 */
export const hierarchy = createHierarchy({
  organization: createContext(appConfig.roles.entityRoles),
  attachment: createProduct(['organization']),
  page: createProduct([]),
});

/**
 * Configure access policies for each entity type.
 *
 * ## Policy Configuration
 *
 * Policies define CRUD + search permissions per role within each context.
 * Values: `1` = allowed, `0` = denied
 *
 * ## Adding New Entities Checklist
 *
 * 1. Add entity to `hierarchy` with `createContext()` or `createProduct()`
 * 2. Add entity type to appConfig
 * 3. Define access policies in the switch statement below
 * 4. Create DB schema in `backend/src/db/schema/`
 * 5. Run `pnpm generate` to create migrations
 */
export const accessPolicies = configureAccessPolicies(hierarchy, appConfig.entityTypes, ({ subject, contexts }) => {
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
