/**
 * Mutation squashing and coalescing utilities.
 *
 * These utilities optimize the mutation queue by:
 * - Squashing: Canceling pending same-field mutations when a new one arrives
 * - Coalescing: Merging updates into pending creates
 */

import type { QueryClient } from '@tanstack/react-query';

/**
 * Squash pending mutations for the same entity field.
 * Removes any pending mutation for the same field from the cache.
 *
 * Call this in onMutate before optimistic updates.
 *
 * @param queryClient - React Query client
 * @param mutationKey - Mutation key to match (e.g., ['page', 'update'])
 * @param entityId - Entity being mutated
 * @param data - New mutation data (to detect field)
 * @param trackedFields - Fields to check
 */
export async function squashPendingMutation(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  entityId: string,
  data: object,
  trackedFields: readonly string[],
): Promise<void> {
  const changedField = trackedFields.find((field) => field in data);
  if (!changedField) return;

  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey });

  for (const mutation of mutations) {
    // Skip completed or failed mutations
    if (mutation.state.status !== 'pending') continue;

    // Check if this mutation is for the same entity and field
    const variables = mutation.state.variables as { id?: string; data?: object } | undefined;
    if (variables?.id !== entityId) continue;

    const mutationField = trackedFields.find((field) => field in (variables.data ?? {}));
    if (mutationField === changedField) {
      // Same field - remove this mutation from cache (squash)
      // The new mutation will supersede the old one
      mutationCache.remove(mutation);
    }
  }
}

/**
 * Check for pending create mutation and coalesce update into it.
 * If there's a pending create for this entity, merge the update data.
 *
 * @param queryClient - React Query client
 * @param createMutationKey - Create mutation key (e.g., ['page', 'create'])
 * @param entityId - Entity ID (temp ID for optimistic creates)
 * @param updateData - Update data to merge
 * @returns true if coalesced (caller should skip normal update flow)
 */
export function coalescePendingCreate(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  entityId: string,
  updateData: object,
): boolean {
  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey: createMutationKey });

  for (const mutation of mutations) {
    // Only coalesce into pending creates
    if (mutation.state.status !== 'pending') continue;

    // Check if this create is for the same entity
    const variables = mutation.state.variables as ({ id?: string } & object) | undefined;
    if (variables?.id !== entityId) continue;

    // Merge update data into create variables
    Object.assign(variables, updateData);
    return true;
  }

  return false;
}

/**
 * Check if there's a pending delete for an entity.
 * Use this to skip updates to entities being deleted.
 *
 * @param queryClient - React Query client
 * @param deleteMutationKey - Delete mutation key (e.g., ['page', 'delete'])
 * @param entityId - Entity ID to check
 */
export function hasPendingDelete(
  queryClient: QueryClient,
  deleteMutationKey: readonly unknown[],
  entityId: string,
): boolean {
  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey: deleteMutationKey });

  for (const mutation of mutations) {
    if (mutation.state.status !== 'pending') continue;

    const variables = mutation.state.variables as { id?: string } | { id?: string }[] | undefined;

    // Handle array of entities (batch delete)
    if (Array.isArray(variables)) {
      if (variables.some((v) => v.id === entityId)) return true;
    } else if (variables?.id === entityId) {
      return true;
    }
  }

  return false;
}
