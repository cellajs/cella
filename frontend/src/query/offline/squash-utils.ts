import type { QueryClient } from '@tanstack/react-query';
import { type ArrayDelta, isArrayDelta, mergeArrayDeltas } from './array-delta';

type OpsVariables = { id?: string; ops?: Record<string, unknown> };

// Merge two ops objects: scalar fields are overwritten by `newer`; AWSet deltas are merged via mergeArrayDeltas.
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
 * Squash pending same-entity mutations by merging their `ops` into the incoming one (newer scalars
 * win; AWSet deltas merge via mergeArrayDeltas), removing the old pending mutations. Returns the
 * merged ops. Call from onMutate before optimistic updates.
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

    // Remove old mutation; the new one will carry merged ops.
    mutationCache.remove(mutation);
  }

  return mergedOps;
}

/**
 * If a pending create exists for the entity (matched by temp `id`), merge the update `ops` into its
 * variables and return true, causing the caller to skip the normal update flow. False if none exist.
 */
export function squashIntoPendingCreate(
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
