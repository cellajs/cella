import type { EntityType } from 'shared';
import type { InfiniteQueryData, QueryData } from '~/query/types';

export interface ItemData {
  id: string;
  membership?: { id: string } | null;
}

export type EntityIdAndType = { id: string; entityType: EntityType };
export type QueryDataActions = 'create' | 'update' | 'remove';

export type EntityQueryData = QueryData<ItemData>;
export type InfiniteEntityQueryData = InfiniteQueryData<ItemData>;
export type ArbitraryEntityQueryData = Record<string, EntityIdAndType | EntityIdAndType[]>;
