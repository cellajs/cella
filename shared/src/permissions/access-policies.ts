import { appConfig } from '../../app-config';
import { getContextRoles } from '../../entity-guards';
import type { ContextEntityType, EntityRole, EntityType, ProductEntityType } from '../../types';
import type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ContextPolicyBuilder,
  EntityActionPermissions,
  SubjectAccessPolicies,
} from './types';

/**
 * Creates a context policy builder for fluent role-permission configuration.
 */
const createContextPolicyBuilder = (
  contextType: ContextEntityType,
  roles: readonly string[],
  entries: AccessPolicyEntry[],
): ContextPolicyBuilder => {
  const builder = {} as ContextPolicyBuilder;

  for (const role of roles) {
    builder[role as EntityRole] = (permissions: EntityActionPermissions) => {
      entries.push({ contextType, role: role as EntityRole, permissions });
    };
  }

  return builder;
};

/**
 * Creates a contexts object with builders for all context types.
 */
const createContextBuilders = (entries: AccessPolicyEntry[]): Record<ContextEntityType, ContextPolicyBuilder> => {
  const contexts = {} as Record<ContextEntityType, ContextPolicyBuilder>;

  for (const contextType of appConfig.contextEntityTypes) {
    const roles = getContextRoles(contextType);
    contexts[contextType] = createContextPolicyBuilder(contextType, roles, entries);
  }

  return contexts;
};

/**
 * Configures access policies for all entity types using a callback pattern.
 * The callback receives subject info and context builders for fluent configuration.
 *
 * @example
 * ```ts
 * const policies = configureAccessPolicies(entityTypes, ({ subject, contexts }) => {
 *   switch (subject.name) {
 *     case 'organization':
 *       contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
 *       contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
 *       break;
 *   }
 * });
 * ```
 */
export const configureAccessPolicies = (
  entityTypes: readonly EntityType[],
  callback: AccessPolicyCallback,
): AccessPolicies => {
  const policies: AccessPolicies = {};

  const permissionableTypes = entityTypes.filter(
    (type): type is ContextEntityType | ProductEntityType => type !== 'user',
  );

  for (const entityType of permissionableTypes) {
    const entries: AccessPolicyEntry[] = [];
    const contexts = createContextBuilders(entries);

    const config: AccessPolicyConfiguration = {
      subject: { name: entityType },
      contexts,
    };

    callback(config);

    if (entries.length > 0) {
      policies[entityType] = entries;
    }
  }

  return policies;
};

/**
 * Gets the access policies for a specific subject (entity type).
 */
export const getSubjectPolicies = (
  subject: ContextEntityType | ProductEntityType,
  policies: AccessPolicies,
): SubjectAccessPolicies => {
  return policies[subject] ?? [];
};

/**
 * Gets the permissions for a specific context and role combination.
 */
export const getPolicyPermissions = (
  policies: SubjectAccessPolicies,
  contextType: ContextEntityType,
  role: EntityRole,
): EntityActionPermissions | undefined => {
  const entry = policies.find((p) => p.contextType === contextType && p.role === role);
  return entry?.permissions;
};
