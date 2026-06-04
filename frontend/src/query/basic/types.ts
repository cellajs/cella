import type { ContextEntityType, EntityIdColumnKeys, EntityType } from 'shared';
import type { InfiniteQueryData, QueryData } from '~/query/types';

export interface ItemData {
  id: string;
  membership?: { id: string } | null;
}

/** Mapped type for all context entity ID columns (e.g., organizationId, workspaceId, projectId) */
export type ContextEntityIdColumns = {
  [K in ContextEntityType as EntityIdColumnKeys[K]]: string | null;
};

/** Entity data with optional context columns */
export type ItemDataWithContext = ItemData & Partial<ContextEntityIdColumns>;

export type EntityIdAndType = { id: string; entityType: EntityType };
export type QueryDataActions = 'create' | 'update' | 'remove';

export type EntityQueryData = QueryData<ItemData>;
export type InfiniteEntityQueryData = InfiniteQueryData<ItemData>;
export type ArbitraryEntityQueryData = Record<string, EntityIdAndType | EntityIdAndType[]>;
