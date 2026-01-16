import { appConfig } from 'config';
import { configureAccessPolicies, createContext, createHierarchy, createProduct } from './permission-manager';

/**
 * Define hierarchical stru cture for context entities with roles, and for product entities without roles.
 */
export const hierarchy = createHierarchy({
  organization: createContext(appConfig.roles.entityRoles),
  attachment: createProduct(['organization']),
  page: createProduct([]),
});

/**
 * Configure access policies for each entity type.
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
