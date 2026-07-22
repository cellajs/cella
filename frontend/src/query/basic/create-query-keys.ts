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
 * Identify default-filter views eligible for the live canonical home list.
 * Do not use when a feed's default response has implicit server filters absent from delta rows.
 */
export function isDefaultListView(filters: Record<string, unknown>, defaults: Record<string, unknown>): boolean {
  return Object.entries(filters).every(
    ([key, value]) => value === undefined || value === '' || value === defaults[key],
  );
}

/**
 * Creates prefix-matchable entity keys with one canonical list per effective home channel.
 * Live sync splices that home list; cross-home or server-filtered lists use filtered keys and
 * invalidate because their predicates cannot be evaluated locally.
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
