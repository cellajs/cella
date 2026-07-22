import type { ProductEntityType } from 'shared';
import { normalizeOps } from 'shared/schema-evolution';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import type { ArrayDelta } from './array-delta';
import { applyArrayDelta, isArrayDelta } from './array-delta';
import { buildStx } from './build-stx';
import { createServerStx } from './create-server-stx';
import { filterNoOpFields, resolveFieldConflicts } from './field-versions';
import { advanceClock, generateServerHLC } from './hlc';

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

type UpdateResult<T extends Record<string, unknown>> = ResolvedUpdate<T> | NoOpUpdate;

interface PreparedOps {
  scalarOps: Record<string, unknown>;
  deltaOps: Record<string, { add: string[]; remove: string[] }>;
}

function prepareOps(entity: Record<string, unknown>, ops: Record<string, unknown>): PreparedOps {
  const scalarOps: Record<string, unknown> = {};
  const deltaOps: Record<string, { add: string[]; remove: string[] }> = {};

  for (const [key, value] of Object.entries(ops)) {
    if (isArrayDelta(value)) deltaOps[key] = value;
    else scalarOps[key] = value;
  }

  return { scalarOps: filterNoOpFields(entity, scalarOps), deltaOps };
}

function resolvePreparedOps<T extends Record<string, unknown>>(
  entity: Record<string, unknown> & { stx: StxBase },
  prepared: PreparedOps,
  stx: StxBase,
): UpdateResult<T> {
  const acceptedFields = resolveFieldConflicts(prepared.scalarOps, stx.fieldTimestamps, entity.stx.fieldTimestamps);

  const resolvedArrays: Record<string, string[]> = {};
  for (const [key, delta] of Object.entries(prepared.deltaOps)) {
    const current = Array.isArray(entity[key]) ? entity[key] : [];
    resolvedArrays[key] = applyArrayDelta(current, delta);
  }

  const acceptedFieldNames = [...Object.keys(acceptedFields), ...Object.keys(prepared.deltaOps)];
  if (acceptedFieldNames.length === 0) return { changed: false };

  return {
    changed: true,
    values: { ...acceptedFields, ...resolvedArrays } as Partial<ResolveDeltas<T>>,
    acceptedFieldNames: acceptedFieldNames as (keyof T & string)[],
    stx: buildStx(stx, entity, acceptedFieldNames),
  };
}

/**
 * Resolves a product update through lens normalization, no-op filtering, HLC conflicts,
 * and AWSet deltas. Keys and expand-window twins are canonicalized before conflict logic;
 * returns unchanged when no operation survives.
 */
export function resolveUpdateOps<T extends Record<string, unknown>>(
  entityType: ProductEntityType,
  entity: Record<string, unknown> & { stx: StxBase },
  rawOps: T,
  rawStx: StxBase,
): UpdateResult<T> {
  const { ops, stx } = normalizeOps(entityType, rawOps, rawStx);
  return resolvePreparedOps<T>(entity, prepareOps(entity, ops), stx);
}

/** Resolve a trusted server update after assigning one causally-new HLC to all changed scalar fields. */
export function resolveServerUpdateOps<T extends Record<string, unknown>>(
  entityType: ProductEntityType,
  entity: Record<string, unknown> & { stx: StxBase },
  rawOps: T,
): UpdateResult<T> {
  const { ops, stx } = normalizeOps(entityType, rawOps, createServerStx());
  const prepared = prepareOps(entity, ops);
  const scalarFieldNames = Object.keys(prepared.scalarOps);

  for (const field of scalarFieldNames) {
    const storedHLC = entity.stx.fieldTimestamps[field];
    if (storedHLC) advanceClock(storedHLC);
  }

  const serverStx = { ...stx };
  if (scalarFieldNames.length > 0) {
    const timestamp = generateServerHLC(stx.sourceId);
    serverStx.fieldTimestamps = Object.fromEntries(scalarFieldNames.map((field) => [field, timestamp]));
  }

  return resolvePreparedOps<T>(entity, prepared, serverStx);
}
