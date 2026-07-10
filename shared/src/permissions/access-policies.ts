import type { ContextEntityType, EntityActionType, EntityType, ProductEntityType } from '../../types';
import type { PublicReadGrants, PublicReadMode } from './public-read';
import { own } from './row-conditions';
import { normalizeRestriction, type RowRestrictionInput, type RowRestrictions } from './row-restrictions';
import type {
  AccessPolicies,
  AccessPolicyCallback,
  AccessPolicyConfiguration,
  AccessPolicyEntry,
  ContextPolicyBuilder,
  EntityActionPermissions,
  NormalizedPermissionValue,
  PermissionValue,
  SubjectAccessPolicies,
} from './types';
import { resolveTopology } from './permission-manager/resolve-topology';
import type { PermissionTopology } from './permission-manager/topology';

/** Resolves the `'own'` sugar literal to the built-in condition; passes everything else through. */
const normalizePermissionValue = (value: PermissionValue): NormalizedPermissionValue => {
  return value === 'own' ? own : value;
};

/**
 * Creates a context policy builder for fluent role-permission configuration.
 */
const createContextPolicyBuilder = (
  contextType: ContextEntityType,
  roles: readonly string[],
  entries: AccessPolicyEntry[],
  entityActions: readonly EntityActionType[],
): ContextPolicyBuilder => {

  const builder: Record<string, (permissions: Partial<Record<EntityActionType, PermissionValue>>) => void> = {};

  for (const role of roles) {
    builder[role] = (permissions: Partial<Record<EntityActionType, PermissionValue>>) => {
      // Normalize to a full record so the engine always reads an explicit value: any action the
      // policy omits defaults to 0 (denied), and the `'own'` sugar literal resolves to the
      // built-in row condition.
      const fullPermissions = {} as EntityActionPermissions;
      for (const action of entityActions) {
        fullPermissions[action] = normalizePermissionValue(permissions[action] ?? 0);
      }
      entries.push({ contextType, role, permissions: fullPermissions });
    };
  }

  return builder as ContextPolicyBuilder;
};

/**
 * Creates a contexts object with builders for all context types.
 */
const createContextBuilders = (
  entries: AccessPolicyEntry[],
  contextEntityTypes: readonly ContextEntityType[],
  getRoles: (contextType: string) => readonly string[],
  entityActions: readonly EntityActionType[],
): Record<ContextEntityType, ContextPolicyBuilder> => {
  const contexts = {} as Record<ContextEntityType, ContextPolicyBuilder>;

  for (const contextType of contextEntityTypes) {
    const roles = getRoles(contextType);
    contexts[contextType] = createContextPolicyBuilder(contextType, roles, entries, entityActions);
  }

  return contexts;
};

/** Result of `configurePermissions`: role×context policies + subject-level grants/restrictions. */
export interface PermissionsConfigResult {
  accessPolicies: AccessPolicies;
  publicReadGrants: PublicReadGrants;
  rowRestrictions: RowRestrictions;
}

/**
 * Configures the full permission set for all entity types using a callback pattern.
 * The callback receives the subject, context builders for role×context grants, and
 * `publicRead(mode)` for the subject-level public read grant (see `public-read.ts`).
 *
 * @example
 * ```ts
 * const { accessPolicies, publicReadGrants } = configurePermissions(entityTypes, ({ subject, contexts, publicRead }) => {
 *   switch (subject.name) {
 *     case 'project':
 *       publicRead('publicSelf'); // readable by anyone once its publicAt is set
 *       contexts.organization.admin({ create: 1, read: 1, update: 1, delete: 1 });
 *       break;
 *   }
 * });
 * ```
 */
export const configurePermissions = (
  entityTypes: readonly EntityType[],
  callback: AccessPolicyCallback,
  topology?: PermissionTopology,
  options?: {
    /**
     * Assert at config time that every subject with declared rows covers EVERY role of
     * EVERY context in its ancestor chain (default true — see
     * `validatePolicyCompleteness`). Test helpers with deliberately partial fixtures
     * opt out.
     */
    validateCompleteness?: boolean;
  },
): PermissionsConfigResult => {
  const policies: AccessPolicies = {};
  const publicReadGrants: PublicReadGrants = {};
  const rowRestrictions: RowRestrictions = {};

  // Topology defaults to the app's real config; tests pass a synthetic one (wide-fixture.ts).
  const { entityActions, contextEntityTypes, getRoles, getParent } = resolveTopology(topology);
  const validateCompleteness = options?.validateCompleteness ?? true;

  const permissionableTypes = entityTypes.filter(
    (type): type is ContextEntityType | ProductEntityType => type !== 'user',
  );

  for (const entityType of permissionableTypes) {
    const entries: AccessPolicyEntry[] = [];
    const contexts = createContextBuilders(entries, contextEntityTypes, getRoles, entityActions);

    const config: AccessPolicyConfiguration = {
      subject: { name: entityType },
      contexts,
      publicRead: (mode: PublicReadMode) => {
        if (publicReadGrants[entityType]) {
          throw new Error(`[Permission] publicRead() called twice for "${entityType}"`);
        }
        publicReadGrants[entityType] = mode;
      },
      restrict: (restriction: RowRestrictionInput) => {
        if (rowRestrictions[entityType]) {
          throw new Error(`[Permission] restrict() called twice for "${entityType}"`);
        }
        rowRestrictions[entityType] = normalizeRestriction(restriction);
      },
    };

    callback(config);

    if (entries.length > 0) {
      policies[entityType] = entries;
    }
  }

  validatePublicReadGrants(publicReadGrants, getParent);
  if (validateCompleteness) {
    validatePolicyCompleteness(policies, { contextEntityTypes, getRoles, getParent });
  }

  return { accessPolicies: policies, publicReadGrants, rowRestrictions };
};

/**
 * The engine is strict at runtime: the first membership whose (context, role) has no
 * policy row for the checked subject THROWS — a request-time 500 that only surfaces
 * when a real user with that role hits that subject. Enforce the same rule at config
 * time instead: every subject that declares ANY rows must declare a row for every role
 * of every context in its ancestor chain — an all-zero row (`contexts.x.role({})`)
 * expresses "no access" explicitly. Subjects with no case at all are skipped (they
 * fail fast with a clear engine error on their first check).
 */
const validatePolicyCompleteness = (
  policies: AccessPolicies,
  topology: {
    contextEntityTypes: readonly ContextEntityType[];
    getRoles: (contextType: string) => readonly string[];
    getParent: (type: string) => string | null;
  },
): void => {
  const { contextEntityTypes, getRoles, getParent } = topology;

  /** The subject's context chain: self (for context entities) plus every ancestor. */
  const chainOf = (subject: string): ContextEntityType[] => {
    const chain: ContextEntityType[] = [];
    let current: string | null = contextEntityTypes.includes(subject as ContextEntityType)
      ? subject
      : getParent(subject);
    while (current) {
      chain.push(current as ContextEntityType);
      current = getParent(current);
    }
    return chain;
  };

  const missing: string[] = [];
  for (const [subject, entries] of Object.entries(policies)) {
    const declared = new Set(entries.map((entry) => `${entry.contextType}:${entry.role}`));
    for (const contextType of chainOf(subject)) {
      for (const role of getRoles(contextType)) {
        if (!declared.has(`${contextType}:${role}`)) missing.push(`"${subject}": ${contextType}.${role}`);
      }
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `[Permission] Incomplete policy: every subject with declared rows needs a row for every role of every context in its chain (all-zero rows express "no access"). Missing:\n  ${missing.join('\n  ')}`,
    );
  }
};

/**
 * A parent-dependent public grant only works if the parent itself can become public:
 * its own grant must include self-publication.
 */
const validatePublicReadGrants = (
  grants: PublicReadGrants,
  getParent: (type: string) => string | null,
): void => {
  for (const [entityType, mode] of Object.entries(grants) as [ContextEntityType | ProductEntityType, PublicReadMode][]) {
    if (mode !== 'publicParent' && mode !== 'publicParentOrSelf') continue;

    const parent = getParent(entityType);
    const parentMode = parent ? grants[parent as ContextEntityType | ProductEntityType] : undefined;
    if (parentMode !== 'publicSelf' && parentMode !== 'publicParentOrSelf') {
      throw new Error(
        `[Permission] "${entityType}" declares publicRead '${mode}' but its parent "${parent}" has no self-publication grant (publicRead 'publicSelf').`,
      );
    }
  }
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
  // Raw/test path: synthetic policy sets are deliberately partial, so no completeness check.
  return configurePermissions(entityTypes, callback, topology, { validateCompleteness: false }).accessPolicies;
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
  role: string,
): EntityActionPermissions | undefined => {
  const entry = policies.find((p) => p.contextType === contextType && p.role === role);
  return entry?.permissions;
};
