import type { QueryClient } from '@tanstack/react-query';
import { type ArrayDelta, isArrayDelta, mergeArrayDeltas } from './array-delta';

type OpsVariables = { id?: string; ops?: Record<string, unknown> };
type CreateVariables = { id?: string; data?: Array<Record<string, unknown> | undefined> };

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

/** PAUSED mutations only: in-flight requests must never be squashed away (their ops are on the wire). */
function isPausedPending(mutation: { state: { status: string; isPaused: boolean } }): boolean {
  return mutation.state.status === 'pending' && mutation.state.isPaused;
}

/**
 * Squash PAUSED same-entity update mutations into an update about to be issued: merge their
 * `ops` under the new ones (newer scalars win; AWSet deltas merge via mergeArrayDeltas) and
 * remove the old paused mutations. Returns the merged ops.
 *
 * Call from the wrapped `mutate()` BEFORE `mutation.mutate(...)` and put the result in the new
 * mutation's variables: the request then carries the merge, so an offline edit A followed by
 * edit B replays as one A+B update. (Calling from `onMutate` is wrong twice: the caller is
 * already a pending cache entry and would squash itself out of the cache, and in-flight
 * mutations would be removed without cancelling their requests.)
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
    if (!isPausedPending(mutation)) continue;

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
 * If a PAUSED create exists for the entity, merge scalar update `ops` into the create's row and
 * return true, so the caller skips issuing an update mutation entirely (the create replays with
 * the merged fields). Matches both create-variable shapes: a top-level `id` and batch creates
 * carrying `data: [{ id, ... }]`.
 *
 * Array-delta ops always return false: creates carry full arrays while deltas are relative, so
 * those edits fall through to a normal update (serialized after the create by mutation scope).
 */
/**
 * Cancel PAUSED creates for rows about to be deleted: those rows never reached the server, so
 * no delete request may be sent for them either (the create would replay on reconnect and the
 * row would resurrect — or the delete would 404). Removes matching rows from batch-create
 * `data[]` variables (dropping the whole mutation when no rows remain) and removes matching
 * top-level-id creates. Returns the ids whose creates were cancelled; the caller keeps those
 * ids out of the delete request and finishes their deletion cache-side only.
 */
export function removePausedCreates(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  ids: string[],
): string[] {
  const idSet = new Set(ids);
  const cancelled: string[] = [];
  const mutationCache = queryClient.getMutationCache();

  for (const mutation of mutationCache.findAll({ mutationKey: createMutationKey })) {
    if (!isPausedPending(mutation)) continue;

    const variables = mutation.state.variables as CreateVariables | undefined;
    if (!variables) continue;

    if (typeof variables.id === 'string' && idSet.has(variables.id)) {
      cancelled.push(variables.id);
      mutationCache.remove(mutation);
      continue;
    }

    if (Array.isArray(variables.data)) {
      const kept: typeof variables.data = [];
      for (const row of variables.data) {
        const rowId = row && typeof row.id === 'string' ? row.id : undefined;
        if (rowId && idSet.has(rowId)) cancelled.push(rowId);
        else kept.push(row);
      }
      if (kept.length === variables.data.length) continue;
      if (kept.length === 0) mutationCache.remove(mutation);
      else variables.data = kept;
    }
  }

  return cancelled;
}

export function squashIntoPendingCreate(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  entityId: string,
  ops: Record<string, unknown>,
): boolean {
  if (Object.values(ops).some((value) => isArrayDelta(value))) return false;

  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey: createMutationKey });

  for (const mutation of mutations) {
    if (!isPausedPending(mutation)) continue;

    const variables = mutation.state.variables as CreateVariables | undefined;
    if (!variables) continue;

    const target =
      variables.id === entityId
        ? (variables as Record<string, unknown>)
        : variables.data?.find((row) => row?.id === entityId);
    if (!target) continue;

    Object.assign(target, ops);
    return true;
  }

  return false;
}
