import type { ContextEntityType, EntityRole, EntityType, ProductEntityType } from 'config';
import type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ContextPolicyBuilder,
  EntityActionPermissions,
  HierarchyConfig,
  SubjectAccessPolicies,
} from './types';

/**
 * Creates a context policy builder for fluent role-permission configuration.
 * Returns an object with methods for each entity role.
 *
 * @param contextType - The context entity type.
 * @param roles - Available roles for this context.
 * @param entries - Array to collect policy entries.
 * @returns Builder with role methods for setting permissions.
 */
const createContextPolicyBuilder = (
  contextType: ContextEntityType,
  roles: readonly EntityRole[],
  entries: AccessPolicyEntry[],
): ContextPolicyBuilder => {
  const builder = {} as ContextPolicyBuilder;

  for (const role of roles) {
    builder[role] = (permissions: EntityActionPermissions) => {
      entries.push({ contextType, role, permissions });
    };
  }

  return builder;
};

/**
 * Creates a contexts object with builders for all context types in the hierarchy.
 *
 * @param hierarchy - The hierarchy configuration.
 * @param entries - Array to collect policy entries.
 * @returns Object with context builders keyed by context type.
 */
const createContextBuilders = (
  hierarchy: HierarchyConfig,
  entries: AccessPolicyEntry[],
): Record<ContextEntityType, ContextPolicyBuilder> => {
  const contexts = {} as Record<ContextEntityType, ContextPolicyBuilder>;

  for (const [entityType, config] of Object.entries(hierarchy)) {
    if (config.type === 'context') {
      contexts[entityType as ContextEntityType] = createContextPolicyBuilder(
        entityType as ContextEntityType,
        config.roles,
        entries,
      );
    }
  }

  return contexts;
};

/**
 * Configures access policies for all entity types using a callback pattern.
 * The callback receives subject info and context builders for fluent configuration.
 *
 * @param hierarchy - The hierarchy configuration.
 * @param entityTypes - All entity types to configure policies for.
 * @param callback - Configuration callback that sets up policies per subject.
 * @returns Access policies mapping subjects to their policy entries.
 *
 * @example
 * ```ts
 * const policies = configureAccessPolicies(hierarchy, entityTypes, ({ subject, contexts }) => {
 *   switch (subject.name) {
 *     case 'organization':
 *       contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
 *       contexts.organization.member({ create: 0, read: 1, update: 0, delete: 0 });
 *       break;
 *     case 'attachment':
 *       contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
 *       contexts.organization.member({ create: 1, read: 1, update: 0, delete: 1 });
 *       break;
 *   }
 * });
 * ```
 */
export const configureAccessPolicies = (
  hierarchy: HierarchyConfig,
  entityTypes: readonly EntityType[],
  callback: AccessPolicyCallback,
): AccessPolicies => {
  const policies: AccessPolicies = {};

  // Filter to only permissionable entity types (context and product, not user)
  const permissionableTypes = entityTypes.filter(
    (type): type is ContextEntityType | ProductEntityType => type !== 'user',
  );

  for (const entityType of permissionableTypes) {
    const entries: AccessPolicyEntry[] = [];
    const contexts = createContextBuilders(hierarchy, entries);

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
 *
 * @param subject - The entity type to get policies for.
 * @param policies - The full access policies configuration.
 * @returns Array of policy entries for the subject, or empty array.
 */
export const getSubjectPolicies = (
  subject: ContextEntityType | ProductEntityType,
  policies: AccessPolicies,
): SubjectAccessPolicies => {
  return policies[subject] ?? [];
};

/**
 * Gets the permissions for a specific context and role combination.
 *
 * @param policies - The subject's access policies.
 * @param contextType - The context entity type.
 * @param role - The role name.
 * @returns Entity action permissions if found, undefined otherwise.
 */
export const getPolicyPermissions = (
  policies: SubjectAccessPolicies,
  contextType: ContextEntityType,
  role: EntityRole,
): EntityActionPermissions | undefined => {
  const entry = policies.find((p) => p.contextType === contextType && p.role === role);
  return entry?.permissions;
};
