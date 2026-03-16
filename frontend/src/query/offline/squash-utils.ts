/**
 * Mutation squashing and coalescing utilities.
 *
 * These utilities optimize the mutation queue by:
 * - Squashing: Merging ops from a new mutation into a pending same-entity mutation
 * - Coalescing: Merging op updates into pending creates
 *
 * Uses the `ops` format: plain values for scalars, `{ add, remove }` for AWSet fields.
 * Online single-field updates and offline multi-field batches use the same format.
 */

import type { QueryClient } from '@tanstack/react-query';
import { type ArrayDelta, isArrayDelta, mergeArrayDeltas } from './array-delta';

type OpsVariables = { id?: string; ops?: Record<string, unknown> };

/**
 * Merge two ops objects, handling AWSet deltas properly.
 * Scalar fields: newer wins (simple overwrite).
 * AWSet fields: deltas are merged via mergeArrayDeltas.
 */
function mergeOps(older: Record<string, unknown>, newer: Record<string, unknown>): Record<string, unknown> {
  const merged = { ...older };
  for (const [key, value] of Object.entries(newer)) {
    const existing = merged[key];
    if (isArrayDelta(value) && isArrayDelta(existing)) {
      merged[key] = mergeArrayDeltas(existing as ArrayDelta, value as ArrayDelta);
    } else {
      merged[key] = value;
    }
  }
  return merged;
}

/**
 * Squash pending mutations for the same entity by merging ops.
 *
 * When a pending mutation exists for the same entity, its `ops` are merged
 * into the new mutation's ops (new values win for overlapping scalar keys,
 * AWSet deltas are merged via mergeArrayDeltas).
 * The old pending mutation is then removed — the new one carries all ops.
 *
 * Call this in onMutate before optimistic updates.
 *
 * @param queryClient - React Query client
 * @param mutationKey - Mutation key to match (e.g., ['page', 'update'])
 * @param entityId - Entity being mutated
 * @param newOps - Ops from the incoming mutation
 * @returns Merged ops (accumulated from pending + new)
 */
export function squashPendingMutation(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  entityId: string,
  newOps: Record<string, unknown>,
): Record<string, unknown> {
  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey });

  let mergedOps = { ...newOps };

  for (const mutation of mutations) {
    if (mutation.state.status !== 'pending') continue;

    const variables = mutation.state.variables as OpsVariables | undefined;
    if (variables?.id !== entityId) continue;

    // Merge: old ops as base, new ops override (with AWSet-aware merging)
    if (variables.ops) {
      mergedOps = mergeOps(variables.ops, mergedOps);
    }

    // Remove old mutation — new one will carry merged ops
    mutationCache.remove(mutation);
  }

  return mergedOps;
}

/**
 * Check for pending create mutation and coalesce update ops into it.
 * If there's a pending create for this entity, merge the ops.
 *
 * @param queryClient - React Query client
 * @param createMutationKey - Create mutation key (e.g., ['page', 'create'])
 * @param entityId - Entity ID (temp ID for optimistic creates)
 * @param ops - Ops to merge into the create
 * @returns true if coalesced (caller should skip normal update flow)
 */
export function coalescePendingCreate(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  entityId: string,
  ops: Record<string, unknown>,
): boolean {
  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey: createMutationKey });

  for (const mutation of mutations) {
    if (mutation.state.status !== 'pending') continue;

    const variables = mutation.state.variables as OpsVariables | undefined;
    if (variables?.id !== entityId) continue;

    // Merge ops into create variables
    Object.assign(variables, ops);
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
