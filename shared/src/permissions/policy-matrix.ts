import type { ChannelEntityType, EntityRole, EntityType } from '../../types.ts';
import { appConfig } from '../config-builder/app-config.ts';
import { recordFromKeys } from '../config-builder/utils.ts';
import { type AccessScopes, deriveAccessScopes } from './access-scopes.ts';
import { type HierarchyOverrides, resolveHierarchy } from './engine/resolve-hierarchy.ts';
import type { PublicReadGrants } from './public-read.ts';
import { isRowCondition } from './row-conditions.ts';
import type {
  ChannelPolicyBuilder,
  EntityActionPermissions,
  EntityPolicies,
  PolicyCallback,
  PolicyConfiguration,
  PolicyEntry,
  PolicyMatrix,
  PolicySetter,
} from './types.ts';

const createChannelPolicyBuilder = (entityType: EntityType, channelType: ChannelEntityType, roles: readonly EntityRole[], entries: PolicyEntry[]) => {
  const builder: Record<string, PolicySetter> = {};

  for (const role of roles) {
    builder[role] = (permissions) => {
      // Expand to a full record so the engine always reads an explicit value; an omitted action
      // defaults to 0 (denied).
      const fullPermissions = recordFromKeys(appConfig.entityActions, (action) => {
        const value = permissions[action] ?? 0;
        // A row-conditioned create is invalid because its absent row cannot satisfy the condition.
        if (action === 'create' && isRowCondition(value)) {
          throw new Error(
            `[Permission] "${channelType}.${role}" uses a row condition ('${value}') on 'create', ` +
              'which can never match: the row does not exist yet. Use 1 or 0 for create.',
          );
        }
        // People are only seen or not: what a role may change about a person is decided elsewhere.
        if (entityType === 'user' && value !== 0 && (action !== 'read' || value !== 1)) {
          throw new Error(
            `[Permission] "${channelType}.${role}" sets ${action}: ${JSON.stringify(value)} on 'user', which takes only read: 1. ` +
              'A role either reads the people of its channel or it does not.',
          );
        }
        return value;
      });
      entries.push({ channelType, role, permissions: fullPermissions });
    };
  }

  return builder;
};

export interface PermissionsConfigResult {
  policyMatrix: PolicyMatrix;
  publicReadGrants: PublicReadGrants;
  /** Derived from the matrix: the access scope vocabulary for API keys and access tokens. @see access-scopes.ts */
  accessScopes: AccessScopes;
}

/**
 * Builds the policy matrix, the public read grants and the access scopes from the app's callback, which runs once per
 * channel and product type and once for `user`; an omitted action denies. @see public-read.ts
 * @throws Error for a `user` cell other than `read: 1`, for public read on `user`, and when the callback throws for `user`.
 */
export const configurePermissions = (
  entityTypes: readonly EntityType[],
  callback: PolicyCallback,
  overrides?: HierarchyOverrides,
): PermissionsConfigResult => {
  const policies: PolicyMatrix = {};
  const publicReadGrants: PublicReadGrants = {};

  const { channelEntityTypes, getRoles } = resolveHierarchy(overrides);

  for (const entityType of entityTypes) {
    const entries: PolicyEntry[] = [];
    // Cast: each channel's builder holds the roles the hierarchy declares for it, a pairing `recordFromKeys` cannot follow.
    const channels = recordFromKeys(channelEntityTypes, (channelType) =>
      createChannelPolicyBuilder(entityType, channelType, getRoles(channelType), entries),
    ) as ChannelPolicyBuilder;

    const config: PolicyConfiguration = {
      entityType,
      channels,
      publicRead: () => {
        if (entityType === 'user') throw new Error('[Permission] publicRead() on "user": people are read only through a role.');
        if (publicReadGrants[entityType]) throw new Error(`[Permission] publicRead() called twice for "${entityType}"`);
        publicReadGrants[entityType] = true;
      },
    };

    try {
      callback(config);
    } catch (error) {
      if (entityType !== 'user') throw error;
      throw new Error(
        '[Permission] The permissions callback threw for "user". Add a `case \'user\'` that grants read to the roles that ' +
          'see people, or none, ahead of a `default` branch that throws.',
        { cause: error },
      );
    }

    if (entries.length > 0) policies[entityType] = entries;
  }

  return { policyMatrix: policies, publicReadGrants, accessScopes: deriveAccessScopes(policies) };
};

/** The policy matrix alone, without public read grants: for tests and callers driving the engine with synthetic policies. */
export const configurePolicyMatrix = (entityTypes: readonly EntityType[], callback: PolicyCallback, overrides?: HierarchyOverrides): PolicyMatrix =>
  configurePermissions(entityTypes, callback, overrides).policyMatrix;

/** Total lookup: an entity type the matrix does not cover yields no entries, which the engine reads as denied. */
export const getEntityPolicies = (policies: PolicyMatrix, entityType: EntityType): EntityPolicies => policies[entityType] ?? [];

/** A channel/role pair with no entry yields `undefined`, which callers read as denied. */
export const getPolicyPermissions = (policies: EntityPolicies, channelType: string, role: string): EntityActionPermissions | undefined =>
  policies.find((policy) => policy.channelType === channelType && policy.role === role)?.permissions;
