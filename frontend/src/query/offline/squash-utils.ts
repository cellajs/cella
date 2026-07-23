import type { QueryClient } from '@tanstack/react-query';
import type { StxBase } from 'sdk';
import { isArrayDelta, mergeArrayDeltas } from './array-delta';
import { canCoalesce, isQueued } from './mutation-queue';

type OpsVariables = { id?: string; ops?: Record<string, unknown>; stx?: StxBase };
type CreateVariables = { id?: string; data?: Array<Record<string, unknown> | undefined> };

// Merge two ops objects: scalar fields are overwritten by `newer`; AWSet deltas are merged via mergeArrayDeltas.
function mergeOps<TOps extends object>(older: Record<string, unknown>, newer: TOps): Record<string, unknown> & TOps {
  const merged = { ...older, ...newer };
  for (const [key, value] of Object.entries(newer)) {
    const existing = older[key];
    if (isArrayDelta(value) && isArrayDelta(existing)) {
      Object.assign(merged, { [key]: mergeArrayDeltas(existing, value) });
    }
  }
  return merged;
}

/** Result of coalescing an update: the merged ops and an stx whose field timestamps preserve each
 * inherited field's original intent time while carrying the incoming edit's timestamps for the
 * fields it actually changed. */
export type SquashedUpdate<TOps extends object> = { ops: TOps; stx: StxBase };

/** Merge queued offline entity updates while preserving inherited LWW timestamps and AWSet intent. */
export function squashPendingMutation<TOps extends object>(
  queryClient: QueryClient,
  mutationKey: readonly unknown[],
  entityId: string,
  newOps: TOps,
  newStx: StxBase,
): SquashedUpdate<TOps> {
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

  const ops = mergeOps(mergedOps, newOps);
  const stx: StxBase = {
    ...newStx,
    fieldTimestamps: { ...inheritedTimestamps, ...newStx.fieldTimestamps },
  };

  return { ops, stx };
}

/**
 * Cancels queued offline creates for rows deleted before reaching the server.
 * Matching batch/top-level creates are removed and returned so deletion stays cache-only.
 * Online deletes remain serialized after their possibly delivered create.
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
 * Folds scalar updates into a matching queued offline create and reports success.
 * Online updates remain serialized separately; relative array deltas cannot merge into a create's
 * full-array representation.
 */
export function squashIntoPendingCreate<TOps extends object>(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  entityId: string,
  ops: TOps,
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
