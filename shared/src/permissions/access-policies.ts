import type { ChannelEntityType, EntityActionType, EntityType, ProductEntityType } from '../../types';
import type { PublicReadGrants, PublicReadMode } from './public-read';
import { isRowCondition } from './row-conditions';
import type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ChannelPolicyBuilder,
  EntityActionPermissions,
  PermissionValue,
  SubjectAccessPolicies,
} from './types';
import { resolveTopology } from './permission-manager/resolve-topology';
import type { PermissionTopology } from './permission-manager/topology';

/**
 * Creates a context policy builder for fluent role-permission configuration.
 */
const createChannelPolicyBuilder = (
  channelType: ChannelEntityType,
  roles: readonly string[],
  entries: AccessPolicyEntry[],
  entityActions: readonly EntityActionType[],
): ChannelPolicyBuilder => {

  const builder: Record<string, (permissions: Partial<Record<EntityActionType, PermissionValue>>) => void> = {};

  for (const role of roles) {
    builder[role] = (permissions: Partial<Record<EntityActionType, PermissionValue>>) => {
      // Expand to a full record so the engine always reads an explicit value: any action the
      // policy omits defaults to 0 (denied). A cell is the config literal verbatim. The `'own'`
      // name IS the value the engine reads, so there is nothing to normalize.
      const fullPermissions = {} as EntityActionPermissions;
      for (const action of entityActions) {
        const value = permissions[action] ?? 0;
        // A row-conditioned create is invalid because its absent row cannot satisfy the condition.
        if (action === 'create' && isRowCondition(value)) {
          throw new Error(
            `[Permission] "${channelType}.${role}" uses a row condition ('${value}') on 'create', ` +
              `which can never match — the row does not exist yet. Use 1 or 0 for create.`,
          );
        }
        fullPermissions[action] = value;
      }
      entries.push({ channelType, role, permissions: fullPermissions });
    };
  }

  return builder as ChannelPolicyBuilder;
};

/**
 * Creates a contexts object with builders for all context types.
 */
const createChannelBuilders = (
  entries: AccessPolicyEntry[],
  channelEntityTypes: readonly ChannelEntityType[],
  getRoles: (channelType: string) => readonly string[],
  entityActions: readonly EntityActionType[],
): Record<ChannelEntityType, ChannelPolicyBuilder> => {
  const contexts = {} as Record<ChannelEntityType, ChannelPolicyBuilder>;

  for (const channelType of channelEntityTypes) {
    const roles = getRoles(channelType);
    contexts[channelType] = createChannelPolicyBuilder(channelType, roles, entries, entityActions);
  }

  return contexts;
};

/** Result of `configurePermissions`: role×context policies + subject-level grants. */
export interface PermissionsConfigResult {
  accessPolicies: AccessPolicies;
  publicReadGrants: PublicReadGrants;
}

/**
 * Configures entity policies through subject-specific role/context builders and a
 * subject-level public-read grant.
 * @see public-read.ts
 */
export const configurePermissions = (
  entityTypes: readonly EntityType[],
  callback: AccessPolicyCallback,
  topology?: PermissionTopology,
): PermissionsConfigResult => {
  const policies: AccessPolicies = {};
  const publicReadGrants: PublicReadGrants = {};

  // Topology defaults to the app's real config; tests pass a synthetic one (wide-fixture.ts).
  const { entityActions, channelEntityTypes, getRoles } = resolveTopology(topology);

  const permissionableTypes = entityTypes.filter(
    (type): type is ChannelEntityType | ProductEntityType => type !== 'user',
  );

  for (const entityType of permissionableTypes) {
    const entries: AccessPolicyEntry[] = [];
    const contexts = createChannelBuilders(entries, channelEntityTypes, getRoles, entityActions);

    const config: AccessPolicyConfiguration = {
      subject: { name: entityType },
      contexts,
      publicRead: (mode: PublicReadMode) => {
        if (publicReadGrants[entityType]) {
          throw new Error(`[Permission] publicRead() called twice for "${entityType}"`);
        }
        publicReadGrants[entityType] = mode;
      },
    };

    callback(config);

    if (entries.length > 0) {
      policies[entityType] = entries;
    }
  }

  return { accessPolicies: policies, publicReadGrants };
};

/**
 * Configures access policies only (no public read grants). Kept for tests and callers
 * that drive the engine with synthetic policies; app configs should use
 * `configurePermissions`.
 */
export const configureAccessPolicies = (
  entityTypes: readonly EntityType[],
  callback: AccessPolicyCallback,
  topology?: PermissionTopology,
): AccessPolicies => {
  return configurePermissions(entityTypes, callback, topology).accessPolicies;
};

/**
 * Gets the access policies for a specific subject (entity type).
 */
export const getSubjectPolicies = (
  subject: ChannelEntityType | ProductEntityType,
  policies: AccessPolicies,
): SubjectAccessPolicies => {
  return policies[subject] ?? [];
};

/**
 * Gets the permissions for a specific context and role combination.
 */
export const getPolicyPermissions = (
  policies: SubjectAccessPolicies,
  channelType: ChannelEntityType,
  role: string,
): EntityActionPermissions | undefined => {
  const entry = policies.find((p) => p.channelType === channelType && p.role === role);
  return entry?.permissions;
};
