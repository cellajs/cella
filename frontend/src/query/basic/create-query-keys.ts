import { appConfig, type EntityType, hierarchy } from 'shared';

type StandardEntityKeys<
  E extends EntityType,
  LF extends object = Record<string, never>,
  SID extends string | number = string,
> = {
  all: [E];
  list: {
    base: [E, 'list'];
    /** Org-scoped prefix: prefix-matches all list queries for one org */
    org: (organizationId: string) => [E, 'list', string];
    /** List key qualified with filters (default: no org segment) */
    filtered: (filters: LF) => [E, 'list', LF];
    /** Canonical scope key: args are hierarchy ancestor IDs (root-first) */
    scope: (...ancestorIds: string[]) => readonly [E, 'list', ...string[]];
    /** Ancestor ID column keys in root-first order, e.g. ['organizationId', 'projectId'] for task */
    scopeKeys: readonly string[];
  };
  detail: {
    base: [E, 'detail'];
    byId: (id: SID) => [E, 'detail', SID];
  };
  create: [E, 'create'];
  update: [E, 'update'];
  delete: [E, 'delete'];
};

/**
 * Standardized query keys for an entity module. Key hierarchy (prefix-matchable):
 *   [entity, 'list']                              broadest (all queries)
 *   [entity, 'list', organizationId]              all queries for one org
 *   [entity, 'list', organizationId, projectId]  canonical scope (product entities)
 *   [entity, 'list', organizationId, {filters}]  specific filtered query
 *
 * Scope ancestors derived from hierarchy-config: task -> scope(organizationId, projectId), page -> scope().
 * `list.scopeKeys` exposes ancestor ID column names for entity-agnostic scope derivation.
 */
export function createEntityKeys<
  LF extends object,
  SID extends string | number = string,
  E extends EntityType = EntityType,
>(entityType: E): StandardEntityKeys<E, LF, SID> {
  // Derive scope ancestors from hierarchy (reverse to root-first order for key segments)
  const ancestors = [...hierarchy.getOrderedAncestors(entityType)].reverse();
  const scopeKeys = Object.freeze(ancestors.map((a) => appConfig.entityIdColumnKeys[a as EntityType]));

  return {
    all: [entityType],
    list: {
      base: [entityType, 'list'],
      org: (organizationId: string) => [entityType, 'list', organizationId],
      filtered: (filters: LF) => [entityType, 'list', filters],
      scope: (...ancestorIds: string[]) => [entityType, 'list', ...ancestorIds] as const,
      scopeKeys,
    },
    detail: {
      base: [entityType, 'detail'],
      byId: (id: SID) => [entityType, 'detail', id],
    },
    create: [entityType, 'create'],
    update: [entityType, 'update'],
    delete: [entityType, 'delete'],
  };
}
