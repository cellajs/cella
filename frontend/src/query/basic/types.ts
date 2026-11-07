import type { EntityType } from 'shared';

export type ItemData = { id: string };

/** Entity fields needed to resolve its registered cache keys and canonical home list. */
export type RoutableItemData = ItemData & { entityType: EntityType; organizationId?: string };

/** An org-scoped entity that can be inserted into a canonical home list. */
export type OrgRoutableItemData = RoutableItemData & { organizationId: string };

export type QueryDataAction = 'create' | 'update' | 'remove';
