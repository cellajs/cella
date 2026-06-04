import type { StxBase } from '#/schemas/sync-transaction-schemas';
import type { ArrayDelta } from './array-delta';
import { applyArrayDelta, isArrayDelta } from './array-delta';
import { buildStx } from './build-stx';
import { filterNoOpFields, resolveFieldConflicts } from './field-versions';

/** Transform ArrayDelta fields to their resolved string[] type */
type ResolveDeltas<T> = {
  [K in keyof T]: T[K] extends ArrayDelta | undefined ? string[] | Exclude<T[K], ArrayDelta> : T[K];
};

interface ResolvedUpdate<T extends Record<string, unknown> = Record<string, unknown>> {
  changed: true;
  /** Merged accepted scalar + resolved array values */
  values: Partial<ResolveDeltas<T>>;
  /** All accepted field names (scalars + deltas) */
  acceptedFieldNames: (keyof T & string)[];
  /** Built stx metadata for the update */
  stx: StxBase;
}

interface NoOpUpdate {
  changed: false;
}

/**
 * Pure sync pipeline: filter no-ops → resolve HLC conflicts → apply AWSet deltas → build stx.
 * Works for any product entity. Returns `{ changed: false }` when nothing survived.
 */
export function resolveUpdateOps<T extends Record<string, unknown>>(
  entity: Record<string, unknown> & { stx: StxBase },
  rawOps: T,
  stx: Pick<StxBase, 'mutationId' | 'sourceId' | 'fieldTimestamps'>,
): ResolvedUpdate<T> | NoOpUpdate {
  // Separate AWSet delta ops from scalar ops
  const scalarOps: Record<string, unknown> = {};
  const deltaOps: Record<string, { add: string[]; remove: string[] }> = {};

  for (const [key, value] of Object.entries(rawOps)) {
    if (isArrayDelta(value)) {
      deltaOps[key] = value;
    } else {
      scalarOps[key] = value;
    }
  }

  // Filter no-op scalar fields and resolve HLC conflicts
  const filtered = filterNoOpFields(entity, scalarOps);
  const { acceptedFields } = resolveFieldConflicts(filtered, stx.fieldTimestamps, entity.stx.fieldTimestamps);

  // Apply AWSet deltas (commutative — no conflict resolution needed)
  const resolvedArrays: Record<string, string[]> = {};
  for (const [key, delta] of Object.entries(deltaOps)) {
    const current = Array.isArray(entity[key]) ? entity[key] : [];
    resolvedArrays[key] = applyArrayDelta(current, delta);
  }

  const acceptedFieldNames = [...Object.keys(acceptedFields), ...Object.keys(deltaOps)];

  if (acceptedFieldNames.length === 0) return { changed: false };

  return {
    changed: true,
    values: { ...acceptedFields, ...resolvedArrays } as Partial<ResolveDeltas<T>>,
    acceptedFieldNames: acceptedFieldNames as (keyof T & string)[],
    stx: buildStx(stx, entity, acceptedFieldNames),
  };
}
