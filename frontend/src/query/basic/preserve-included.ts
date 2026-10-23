import { replaceEqualDeep } from '@tanstack/react-query';

type WithIncluded = { included?: Record<string, unknown> };

/** `structuralSharing` for entity detail queries: keeps cached `included` sub-fields when incoming data omits them, so a partial refetch or `setQueryData` does not wipe cached enrichment. */
export function preserveIncluded(oldData: unknown, newData: unknown): unknown {
  const oldEntity = oldData as WithIncluded | undefined;
  const newEntity = newData as WithIncluded;

  if (!oldEntity?.included || !newEntity) return replaceEqualDeep(oldData, newData);

  // Old fields the new data does not provide are kept.
  return replaceEqualDeep(oldData, { ...newEntity, included: { ...oldEntity.included, ...newEntity.included } });
}
