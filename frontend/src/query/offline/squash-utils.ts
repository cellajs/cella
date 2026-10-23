import type { QueryClient } from '@tanstack/react-query';
import type { StxBase } from 'sdk';
import { isArrayDelta, mergeArrayDeltas } from '~/query/offline/array-delta';
import { canCoalesce, isQueued } from '~/query/offline/mutation-queue';
import { createRowsOf, queuedUpdateOf } from '~/query/offline/mutation-variables';

/** Scalar fields take `newer`'s value; an AWSet delta both objects carry merges through mergeArrayDeltas. */
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

/** Merged ops plus an stx whose field timestamps keep each inherited field's original intent time and carry the incoming edit's timestamps for the fields it changed. */
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

  // Accumulate oldest-first so newer queued edits win, then the incoming edit wins over all.
  let mergedOps: Record<string, unknown> = {};
  let inheritedTimestamps: Record<string, string> = {};

  for (const mutation of mutationCache.findAll({ mutationKey, predicate: isQueued })) {
    const queued = queuedUpdateOf(mutation.state.variables);
    if (queued?.id !== entityId) continue;

    mergedOps = mergeOps(mergedOps, queued.ops);
    inheritedTimestamps = { ...inheritedTimestamps, ...queued.fieldTimestamps };
    mutationCache.remove(mutation);
  }

  const ops = mergeOps(mergedOps, newOps);
  const stx: StxBase = { ...newStx, fieldTimestamps: { ...inheritedTimestamps, ...newStx.fieldTimestamps } };

  return { ops, stx };
}

/** Cancels queued offline creates for rows deleted before reaching the server, so the deletion stays cache-only. Online deletes stay serialized after their possibly delivered create. */
export function removePausedCreates(queryClient: QueryClient, createMutationKey: readonly unknown[], ids: string[]): string[] {
  if (!canCoalesce()) return [];

  const idSet = new Set(ids);
  const cancelled: string[] = [];
  const mutationCache = queryClient.getMutationCache();

  for (const mutation of mutationCache.findAll({ mutationKey: createMutationKey, predicate: isQueued })) {
    const { variables } = mutation.state;
    const rows = createRowsOf(variables);
    const kept = rows.filter((row) => !(typeof row.id === 'string' && idSet.has(row.id)));
    if (kept.length === rows.length) continue;

    for (const row of rows) if (!kept.includes(row) && typeof row.id === 'string') cancelled.push(row.id);
    if (kept.length === 0) mutationCache.remove(mutation);
    else if (typeof variables === 'object' && variables) Object.assign(variables, { data: kept });
  }

  return cancelled;
}

/**
 * Folds scalar updates into a matching queued offline create. Online updates stay serialized, and relative array deltas cannot merge into a create's full-array representation.
 * @param creatableKeys - The keys a create row takes: the keys of the create body's item schema. An edit that names any other key is not folded, since the server would drop that key from the create and no request would carry the edit: it stays an update, queued behind the create.
 * @returns Whether the edit was folded; false leaves it to the caller to issue the update.
 */
export function squashIntoPendingCreate<TOps extends object>(
  queryClient: QueryClient,
  createMutationKey: readonly unknown[],
  entityId: string,
  ops: TOps,
  creatableKeys: readonly string[],
): boolean {
  if (!canCoalesce()) return false;
  if (Object.values(ops).some(isArrayDelta)) return false;
  if (Object.keys(ops).some((key) => !creatableKeys.includes(key))) return false;

  for (const mutation of queryClient.getMutationCache().findAll({ mutationKey: createMutationKey, predicate: isQueued })) {
    const target = createRowsOf(mutation.state.variables).find((row) => row.id === entityId);
    if (!target) continue;

    Object.assign(target, ops);
    return true;
  }

  return false;
}
