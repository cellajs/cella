import type { InfiniteData } from '@tanstack/react-query';
import type { MinimumEntityItem, MinimumMembershipInfo } from '~/types/common';

export interface ItemData {
  id: string;
  membership?: { id: string } | null;
}
export type EntityData = MinimumEntityItem & { membership: MinimumMembershipInfo | null };

export type QueryDataActions = 'create' | 'update' | 'delete' | 'updateMembership';

export type ArbitraryEntityQueryData = Record<string, EntityData | EntityData[]>;

export type EntityQueryData = {
  items: ItemData[];
  total: number;
};

export type InfiniteEntityQueryData = InfiniteData<EntityQueryData>;
