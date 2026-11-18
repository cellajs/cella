import type { EntityType } from 'shared';

export type ItemData = { id: string };

/** An org-scoped entity that can be inserted into a canonical home list. */
export type OrgRoutableItemData = ItemData & { entityType: EntityType; organizationId: string };
