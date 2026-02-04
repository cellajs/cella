import type { EntityType } from 'shared';

export type StandardEntityKeys<E extends EntityType, LF extends object = {}, SID extends string | number = string> = {
  all: [E];
  list: {
    base: [E, 'list'];
    filtered: (filters: LF) => [E, 'list', LF];
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
 * Factory function to create standardized query keys for an entity module.
 * Usage:
 *   createEntityKeys<OrgFilters>('organization')
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
      filtered: (filters: LF) => [entityType, 'list', filters],
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
