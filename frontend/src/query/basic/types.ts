export interface ItemData {
  id: string;
  membership?: { id: string } | null;
}

/** Entity fields needed to resolve its registered cache keys and canonical home list. */
export type RoutableItemData = ItemData & { entityType: string; organizationId?: string };

/** An org-scoped entity that can be inserted into a canonical home list. */
export type OrgRoutableItemData = RoutableItemData & { organizationId: string };

export type QueryDataAction = 'create' | 'update' | 'remove';
