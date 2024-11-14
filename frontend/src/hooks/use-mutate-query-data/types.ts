import type { InfiniteQueryData, QueryData } from '~/modules/common/query-client-provider/types';
import type { ContextEntity, MinimumEntityItem, MinimumMembershipInfo } from '~/types/common';

export interface ItemData {
  id: string;
  membership?: { id: string } | null;
}
export type EntityData = MinimumEntityItem & { membership: MinimumMembershipInfo | null };

export type QueryDataActions = 'create' | 'update' | 'delete' | 'updateMembership';

export type EntityQueryData = QueryData<ItemData>;
export type InfiniteEntityQueryData = InfiniteQueryData<ItemData>;
export type ArbitraryEntityQueryData = Record<string, EntityData | EntityData[]>;

export interface UseMutateQueryDataReturn {
  create: (items: ItemData[] | EntityData[], entity?: ContextEntity) => void;
  update: (items: ItemData[] | EntityData[], entity?: ContextEntity) => void;
  updateMembership: (items: ItemData[] | EntityData[], entity?: ContextEntity) => void;
  remove: (items: ItemData[] | EntityData[], entity?: ContextEntity) => void;
}
