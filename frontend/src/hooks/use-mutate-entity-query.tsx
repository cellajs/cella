import { type QueryKey, useQueryClient } from '@tanstack/react-query';

import type { Entity, Membership, MinimumEntityItem, MinimumMembershipInfo } from '~/types/common';
import type { QueryDataActions } from './use-mutate-query-data';

type EntityMutate = MinimumEntityItem & { membership: MinimumMembershipInfo | null };

function assertEntity(items: (Membership | EntityMutate)[]): asserts items is EntityMutate[] {
  if (!items.length) throw new Error('No items provided');
  if (!('type' in items[0])) throw new Error('Not a entity');
}

function assertMemberships(items: (Membership | EntityMutate)[]): asserts items is Membership[] {
  if (!items.length) throw new Error('No items provided');
  if (!('type' in items[0])) throw new Error('Not a membership');
}

export const useMutateEntityQueryData = (queryKey: QueryKey) => {
  const queryClient = useQueryClient();

  return (items: EntityMutate[] | Membership[], entity: Entity, action: QueryDataActions) => {
    queryClient.setQueryData<Record<string, EntityMutate | EntityMutate[]>>(queryKey, (data) => {
      if (!data) return data;
      const updatedData = { ...data };

      // Iterate through each entry in the data
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) {
          const hasEntityInList = value.some((el) => el.entity === entity);
          if (!hasEntityInList) continue; // Skip if entity is not in the list
          switch (action) {
            case 'create':
              assertEntity(items);
              // Add items to existing list
              updatedData[key] = [...value, ...items];
              break;

            case 'update':
              assertEntity(items);
              updatedData[key] = value.map((mainItem) => {
                const itemToUpdate = items.find((newItem) => newItem.id === mainItem.id);
                return itemToUpdate ? { ...mainItem, ...itemToUpdate } : mainItem; // Update matching items
              });
              break;

            case 'delete':
              // Remove items that match the ids
              updatedData[key] = value.filter((existing) => !items.find((item) => item.id === existing.id));
              break;

            case 'updateMembership': {
              assertMemberships(items);
              const [updatedMembership] = items;
              updatedData[key] = value.map((existing) => ({
                ...existing,
                membership: existing.membership?.id === updatedMembership.id ? { ...existing.membership, ...updatedMembership } : existing.membership,
              }));
              break;
            }

            default:
              return data;
          }
        }
        // Handle cases where the value is a single entity
        if ('entity' in value && value.entity === entity) {
          switch (action) {
            case 'update': {
              assertEntity(items);
              const [newItem] = items;
              updatedData[key] = { ...value, ...newItem }; // Update with the new item
              break;
            }

            case 'updateMembership': {
              assertMemberships(items);
              const [updatedMembership] = items;
              updatedData[key] = {
                ...value,
                membership: { ...value.membership, ...updatedMembership },
              }; // Update membership
              break;
            }

            default:
              return data;
          }
        }
      }

      return updatedData; // Return the modified data
    });
  };
};
