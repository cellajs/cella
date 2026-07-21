import type { QueryClient } from '@tanstack/react-query';
import type { StxBase } from 'sdk';
import { type ArrayDelta, isArrayDelta, mergeArrayDeltas } from './array-delta';
import { canCoalesce, isQueued } from './mutation-queue';

type OpsVariables = { id?: string; ops?: Record<string, unknown>; stx?: StxBase };
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

/** Result of coalescing an update: the merged ops and an stx whose field timestamps preserve each
 * inherited field's original intent time while carrying the incoming edit's timestamps for the
 * fields it actually changed. */
export type SquashedUpdate = { ops: Record<string, unknown>; stx: StxBase };

/**
 * Squash QUEUED (offline-parked) same-entity update mutations into an update about to be issued:
 * merge their `ops` under the new ones (newer scalars win; AWSet deltas merge via mergeArrayDeltas)
 * and remove the old queued mutations. The returned stx keeps each inherited field's original
 * timestamp (LWW must arbitrate by intent time, so a restamp would let an old edit beat a newer
 * one from another client) while the incoming edit's own fields carry `newStx`.
 *
 * No-op while online (returns `{ ops: newOps, stx: newStx }` untouched): a queued mutation can only
 * be safely merged away while offline, before it has completed a server round trip. Once online the
 * caller issues a separate, scope-serialized update. See canCoalesce.
 *
 * Call from the wrapped `mutate()` BEFORE `mutation.mutate(...)` so nothing self-matches and the
 * REQUEST carries the merge: an offline edit A followed by edit B replays as one A+B update.
 */
export function squashPendingMutation(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  entityId: string,
  newOps: Record<string, unknown>,
  newStx: StxBase,
): SquashedUpdate {
  if (!canCoalesce()) return { ops: newOps, stx: newStx };

  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey });

  // Accumulate oldest-first so newer queued edits win, then the incoming edit wins over all.
  let mergedOps: Record<string, unknown> = {};
  let inheritedTimestamps: Record<string, string> = {};

  for (const mutation of mutations) {
    if (!isQueued(mutation)) continue;

    const variables = mutation.state.variables as OpsVariables | undefined;
    if (variables?.id !== entityId) continue;

    if (variables.ops) mergedOps = mergeOps(mergedOps, variables.ops);
    if (variables.stx?.fieldTimestamps) {
      inheritedTimestamps = { ...inheritedTimestamps, ...variables.stx.fieldTimestamps };
    }

    // Remove old mutation; the new one will carry merged ops and merged timestamps.
    mutationCache.remove(mutation);
  }

  mergedOps = mergeOps(mergedOps, newOps);
  const stx: StxBase = {
    ...newStx,
    fieldTimestamps: { ...inheritedTimestamps, ...newStx.fieldTimestamps },
  };

  return { ops: mergedOps, stx };
}

/**
 * Cancel QUEUED (offline-parked) creates for rows about to be deleted: while offline those rows
 * never reached the server, so no delete request may be sent for them either (the create would
 * replay on reconnect and the row would resurrect, or the delete would 404). Removes matching rows
 * from batch-create `data[]` variables (dropping the whole mutation when no rows remain) and removes
 * matching top-level-id creates. Returns the ids whose creates were cancelled; the caller keeps those
 * ids out of the delete request and finishes their deletion cache-side only.
 *
 * No-op while online (returns `[]`): once a create may have reached the server the delete must be
 * sent and scope serialization runs it after the create.
 */
export function removePausedCreates(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  ids: string[],
): string[] {
  if (!canCoalesce()) return [];

  const idSet = new Set(ids);
  const cancelled: string[] = [];
  const mutationCache = queryClient.getMutationCache();

  for (const mutation of mutationCache.findAll({ mutationKey: createMutationKey })) {
    if (!isQueued(mutation)) continue;

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

/**
 * If a QUEUED (offline-parked) create exists for the entity, merge scalar update `ops` into the
 * create's row and return true, so the caller skips issuing an update mutation entirely (the create
 * replays with the merged fields). Matches both create-variable shapes: a top-level `id` and batch
 * creates carrying `data: [{ id, ... }]`.
 *
 * No-op while online (returns false): the caller issues a normal update, serialized after the create
 * by mutation scope. Array-delta ops always return false: creates carry full arrays while deltas are
 * relative, so those edits fall through to a normal update.
 */
export function squashIntoPendingCreate(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  entityId: string,
  ops: Record<string, unknown>,
): boolean {
  if (!canCoalesce()) return false;
  if (Object.values(ops).some((value) => isArrayDelta(value))) return false;

  const mutationCache = queryClient.getMutationCache();
  const mutations = mutationCache.findAll({ mutationKey: createMutationKey });

  for (const mutation of mutations) {
    if (!isQueued(mutation)) continue;

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
