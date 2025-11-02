import type { ContextEntityType, EntityType, ProductEntityType } from 'config';
import type { ContextEntityBase } from '~/api.gen';
import type { InfiniteQueryData, QueryData } from '~/query/types';

export interface ItemData {
  id: string;
  membership?: { id: string } | null;
}

export type EntityData = { id: string; entityType: EntityType };
export type QueryDataActions = 'create' | 'update' | 'remove' | 'updateMembership';

export type EntityQueryData = QueryData<ItemData>;
export type InfiniteEntityQueryData = InfiniteQueryData<ItemData>;
export type ArbitraryEntityQueryData = Record<string, EntityData | EntityData[]>;

export interface UseMutateQueryDataReturn {
  /**
   * Adds items to an Infinite or Regular query. If it's an arbitrary query,
   * it sets the entity to operate with and ensures the key within the data to operate on is provided.
   *
   * This function manages the creation of new items in the data store, supporting three types of item data:
   * ItemData, EntityData, and ContextEntityBase. Optionally, you can specify an entity and the key to operate on
   * when dealing with EntityData or ContextEntityBase.
   *
   * - For Infinite or Regular queries: Adds items directly to the query data.
   * - For Arbitrary queries: Sets the entity to operate with. If multiple different entities returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to create. Can be of types ItemData[], EntityData[], or ContextEntityBase[].
   * @param entity - The optional entity to apply the operation to (required for EntityData or ContextEntityBase).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for EntityData or ContextEntityBase).
   */
  create: {
    (items: ItemData[]): void;
    (items: ContextEntityBase[], entityType: ContextEntityType, keyToOperateIn?: string): void;
    (items: EntityData[], entityType: ProductEntityType, keyToOperateIn: string): void;
  };

  /**
   * Updates items in an Infinite or Regular query. For arbitrary queries,
   * it sets the entity to operate with and ensures the key within the data to operate on is provided.
   *
   * This function manages the update of existing items in the data store, supporting three types of item data:
   * ItemData, EntityData, and ContextEntityBase. Optionally, you can specify an entity and the key to operate on
   * when dealing with EntityData or ContextEntityBase.
   *
   * - For Infinite or Regular queries: Updates the items directly in the query data.
   * - For Arbitrary queries: Sets the entity to operate with. If multiple different entities returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to update. Can be of types ItemData[], EntityData[], or ContextEntityBase[].
   * @param entity - The optional entity to apply the operation to (required for EntityData or ContextEntityBase).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for EntityData or ContextEntityBase).
   */
  update: {
    (items: ItemData[]): void;
    (items: ContextEntityBase[], entityType: ContextEntityType, keyToOperateIn?: string): void;
    (items: EntityData[], entityType: ProductEntityType, keyToOperateIn: string): void;
  };

  /**
   * Updates membership-related items in an Infinite or Regular query. For arbitrary queries,
   * it sets the entity to operate with and ensures the key within the data to operate on is provided.
   *
   * This function manages updates to membership-related data, supporting two types of item data:
   * ItemData and ContextEntityBase. Optionally, you can specify an entity and the key to operate on.
   *
   * - For Infinite or Regular queries: Updates the membership items directly in the query data.
   * - For Arbitrary queries: Sets the entity to operate with. If multiple different entities returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to update. Can be of types ItemData[] or ContextEntityBase[].
   * @param entity - The optional entity to apply the operation to (required for ContextEntityBase).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for ContextEntityBase).
   */
  updateMembership: {
    (items: ItemData[]): void;
    (items: ContextEntityBase[], entityType: ContextEntityType, keyToOperateIn?: string): void;
    (items: ItemData[] | ContextEntityBase[], entity?: ProductEntityType | ContextEntityType, keyToOperateIn?: string): void;
  };

  /**
   * Removes items of type ItemData, EntityData, or ContextEntityBase, with an optional entity and keyToOperateIn.
   *
   * This function handles the deletion of items from the data store, supporting three types of item data:
   * ItemData, EntityData, and ContextEntityBase. For Arbitrary queries: Sets the entity to operate with. If multiple different entities
   * returns ensure passing keyToOperateIn
   *
   * @param items - The list of items to remove. Can be ItemData[], EntityData[], or ContextEntityBase[].
   * @param entity - The optional entity to apply the operation to (required for EntityData or ContextEntityBase).
   * @param keyToOperateIn - The optional key within the entity to operate on (required for EntityData or ContextEntityBase).
   */
  remove: {
    (items: ItemData[]): void;
    (items: ContextEntityBase[], entityType: ContextEntityType, keyToOperateIn?: string): void;
    (items: EntityData[], entityType: ProductEntityType, keyToOperateIn: string): void;
  };
}
