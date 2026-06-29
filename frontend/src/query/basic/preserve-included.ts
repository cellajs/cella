import { replaceEqualDeep } from '@tanstack/react-query';

type WithIncluded = { included?: Record<string, unknown> };

/**
 * Custom `structuralSharing` function for context entity detail queries.
 * Preserves `included` sub-fields (e.g. `counts`, `membership`) from the cached
 * data when the incoming data omits them. This prevents a refetch or
 * `setQueryData` call that carries a partial `included` from wiping out
 * previously-fetched enrichment data such as membership counts.
 *
 * Usage – add to any entity detail `queryOptions`:
 * ```ts
 * queryOptions({
 *   queryKey: keys.detail.byId(id),
 *   queryFn: …,
 *   structuralSharing: preserveIncluded,
 * })
 * ```
 */
export function preserveIncluded(oldData: unknown, newData: unknown): unknown {
  const oldEntity = oldData as WithIncluded | undefined;
  const newEntity = newData as WithIncluded;

  if (!oldEntity?.included || !newEntity) return replaceEqualDeep(oldData, newData);

  const oldIncluded = oldEntity.included;
  const newIncluded = newEntity.included;

  // Nothing to merge – new data has no included at all
  if (!newIncluded) {
    return replaceEqualDeep(oldData, { ...newEntity, included: oldIncluded });
  }

  // Merge: keep old fields that the new data doesn't provide
  const merged = { ...oldIncluded, ...newIncluded };
  return replaceEqualDeep(oldData, { ...newEntity, included: merged });
}
