import type { EntityType } from 'shared';

type StandardEntityKeys<TFilters extends object> = {
  all: [EntityType];
  list: {
    base: [EntityType, 'list'];
    /** Org-scoped prefix: prefix-matches all list queries for one org. A scan/invalidation prefix, never a data key. */
    org: (organizationId: string) => [EntityType, 'list', string];
    filtered: (filters: TFilters) => [EntityType, 'list', TFilters];
    /** Canonical home list: one flat list per home channel; org-homed rows omit homeChannelId. */
    home: (organizationId: string, homeChannelId?: string) => [EntityType, 'list', string, string];
  };
  detail: { base: [EntityType, 'detail']; byId: (id: string) => [EntityType, 'detail', string] };
  create: [EntityType, 'create'];
  update: [EntityType, 'update'];
  delete: [EntityType, 'delete'];
};

/** Identifies default-filter views eligible for the live canonical home list. Not valid when a feed's default response carries implicit server filters absent from range-fetched rows. */
export const isDefaultListView = (filters: Record<string, unknown>, defaults: Record<string, unknown>): boolean =>
  Object.entries(filters).every(([key, value]) => value === undefined || value === '' || value === defaults[key]);

/** A segment of a list key that holds filters: the type and the `'list'` tag before it are strings, a filter set is an object. */
export const isFilterSegment = (segment: unknown): segment is Record<string, unknown> => typeof segment === 'object' && segment !== null;

/** Prefix-matchable keys with one canonical list per effective home channel. Live sync splices that list; cross-home and server-filtered lists use filtered keys and invalidate. */
export const createEntityKeys = <TFilters extends object>(entityType: EntityType): StandardEntityKeys<TFilters> => ({
  all: [entityType],
  list: {
    base: [entityType, 'list'],
    org: (organizationId: string) => [entityType, 'list', organizationId],
    filtered: (filters: TFilters) => [entityType, 'list', filters],
    home: (organizationId: string, homeChannelId?: string) => [entityType, 'list', organizationId, homeChannelId ?? organizationId],
  },
  detail: { base: [entityType, 'detail'], byId: (id: string) => [entityType, 'detail', id] },
  create: [entityType, 'create'],
  update: [entityType, 'update'],
  delete: [entityType, 'delete'],
});
