import type { ContextEntity, Entity, ProductEntity } from 'config';
import type { LimitedEntity } from '~/modules/general/types';
import type { MinimumMembershipInfo } from '~/modules/memberships/types';
import type { InfiniteQueryData, QueryData } from '~/query/types';

export interface ItemData {
  id: string;
  membership?: { id: string } | null;
}

export type ContextEntityData = LimitedEntity & { membership: MinimumMembershipInfo | null };
export type EntityData = { id: string; entity: Entity };

export type QueryDataActions = 'create' | 'update' | 'delete' | 'updateMembership';

export type EntityQueryData = QueryData<ItemData>;
export type InfiniteEntityQueryData = InfiniteQueryData<ItemData>;
export type ArbitraryEntityQueryData = Record<string, EntityData | EntityData[]>;

export interface UseMutateQueryDataReturn {
  /**
   * Adds items to an Infinite or Regular query. If it's an arbitrary query,
   * it sets the entity to operate with and ensures the key within the data to operate on is provided.
   *
   * This function manages the creation of new items in the data store, supporting three types of item data:
   * ItemData, EntityData, and ContextEntityData. Optionally, you can specify an entity and the key to operate on
   * when dealing with EntityData or ContextEntityData.
   *
   * - For Infinite or Regular queries: Adds items directly to the query data.
   * - For Arbitrary queries: Sets the entity to operate with. If multiple different entities returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to create. Can be of types ItemData[], EntityData[], or ContextEntityData[].
   * @param entity - The optional entity to apply the operation to (required for EntityData or ContextEntityData).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for EntityData or ContextEntityData).
   */
  create: {
    (items: ItemData[]): void;
    (items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
    (items: EntityData[], entity: ProductEntity, keyToOperateIn: string): void;
  };

  /**
   * Updates items in an Infinite or Regular query. For arbitrary queries,
   * it sets the entity to operate with and ensures the key within the data to operate on is provided.
   *
   * This function manages the update of existing items in the data store, supporting three types of item data:
   * ItemData, EntityData, and ContextEntityData. Optionally, you can specify an entity and the key to operate on
   * when dealing with EntityData or ContextEntityData.
   *
   * - For Infinite or Regular queries: Updates the items directly in the query data.
   * - For Arbitrary queries: Sets the entity to operate with. If multiple different entities returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to update. Can be of types ItemData[], EntityData[], or ContextEntityData[].
   * @param entity - The optional entity to apply the operation to (required for EntityData or ContextEntityData).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for EntityData or ContextEntityData).
   */
  update: {
    (items: ItemData[]): void;
    (items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
    (items: EntityData[], entity: ProductEntity, keyToOperateIn: string): void;
  };

  /**
   * Updates membership-related items in an Infinite or Regular query. For arbitrary queries,
   * it sets the entity to operate with and ensures the key within the data to operate on is provided.
   *
   * This function manages updates to membership-related data, supporting two types of item data:
   * ItemData and ContextEntityData. Optionally, you can specify an entity and the key to operate on.
   *
   * - For Infinite or Regular queries: Updates the membership items directly in the query data.
   * - For Arbitrary queries: Sets the entity to operate with. If multiple different entities returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to update. Can be of types ItemData[] or ContextEntityData[].
   * @param entity - The optional entity to apply the operation to (required for ContextEntityData).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for ContextEntityData).
   */
  updateMembership: {
    (items: ItemData[]): void;
    (items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
    (items: ItemData[] | ContextEntityData[], entity?: ProductEntity | ContextEntity, keyToOperateIn?: string): void;
  };

  /**
   * Removes items of type ItemData, EntityData, or ContextEntityData, with an optional entity and keyToOperateIn.
   *
   * This function handles the deletion of items from the data store, supporting three types of item data:
   * ItemData, EntityData, and ContextEntityData. For Arbitrary queries: Sets the entity to operate with. If multiple different entities
   * returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to remove. Can be ItemData[], EntityData[], or ContextEntityData[].
   * @param entity - The optional entity to apply the operation to (required for EntityData or ContextEntityData).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for EntityData or ContextEntityData).
   */
  remove: {
    (items: ItemData[]): void;
    (items: ContextEntityData[], entity: ContextEntity, keyToOperateIn?: string): void;
    (items: EntityData[], entity: ProductEntity, keyToOperateIn: string): void;
  };
}
