import type { EntityType } from 'shared';

type StandardEntityKeys<
  E extends EntityType,
  LF extends object = Record<string, never>,
  SID extends string | number = string,
> = {
  all: [E];
  list: {
    base: [E, 'list'];
    /** Org-scoped prefix: prefix-matches all list queries for one org. A scan/invalidation prefix, never a data key. */
    org: (organizationId: string) => [E, 'list', string];
    /** List key qualified with filters (default: no org segment) */
    filtered: (filters: LF) => [E, 'list', LF];
    /** Canonical home list: one flat list per home channel (org-homed rows: omit homeChannelId) */
    home: (organizationId: string, homeChannelId?: string) => [E, 'list', string, string];
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
 * True when a list view's filters all sit at their defaults (absent, empty, or equal). The
 * signal to serve the view from the entity's canonical home list, which live sync keeps
 * fresh and splices creates into. Filtered queries can only be invalidated.
 *
 * Only valid for entities whose default list response IS the unfiltered home list: delta rows
 * must be row-identical to default-list rows. Fork feeds with implicit server-side filters
 * (e.g. draft exclusion) must keep their filtered keys and not adopt this.
 */
export function isDefaultListView(filters: Record<string, unknown>, defaults: Record<string, unknown>): boolean {
  return Object.entries(filters).every(
    ([key, value]) => value === undefined || value === '' || value === defaults[key],
  );
}

/**
 * Standardized query keys for an entity module. Key hierarchy (prefix-matchable):
 *   [entity, 'list']                                 broadest (all queries)
 *   [entity, 'list', organizationId]                 all queries for one org (a prefix, never a data key)
 *   [entity, 'list', organizationId, homeChannelId]  canonical home list: the one list live sync splices into
 *   [entity, 'list', organizationId, {filters}]      specific filtered query (invalidation-synced)
 *
 * The cache is keyed the way SSE is routed: every row belongs to exactly one canonical home
 * list, its effective home channel's (deepest non-null ancestor; the org itself for org-homed
 * rows; see resolve-row-channel). Views derive from the home list via select(). Any list that
 * spans home channels or applies server-side filters is a filtered key: live sync cannot
 * splice rows into it and invalidates it.
 */
export function createEntityKeys<
  LF extends object,
  SID extends string | number = string,
  E extends EntityType = EntityType,
>(entityType: E): StandardEntityKeys<E, LF, SID> {
  return {
    all: [entityType],
    list: {
      base: [entityType, 'list'],
      org: (organizationId: string) => [entityType, 'list', organizationId],
      filtered: (filters: LF) => [entityType, 'list', filters],
      home: (organizationId: string, homeChannelId?: string) => [
        entityType,
        'list',
        organizationId,
        homeChannelId ?? organizationId,
      ],
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
