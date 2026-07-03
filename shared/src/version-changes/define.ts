/**
 * Lens module convention for schema evolution (doba lenses).
 *
 * A lens declares a single breaking schema change once; everything else
 * (widened wire schemas, ops/stx key maps, cache-row migrations, versioned
 * OpenAPI specs) is derived from that declaration.
 *
 * Lens modules are FROZEN once shipped and appended in date order to
 * `index.ts`. The global schema version is the lens count (D2).
 */
import type { ProductEntityType } from '../../types';

/** Rename a scalar field: `from` (old canonical) → `to` (new canonical). */
export type RenameDelta = { rename: { from: string; to: string } };

/** Add a new field. `default` fills the value when migrating older rows forward. */
export type AddDelta = { add: { field: string; default: unknown } };

/** Drop a field. Backward migration cannot restore the value (lossy). */
export type DropDelta = { drop: { field: string } };

/** Change a field's type. Requires `custom` converters (delta alone can't express it). */
export type RetypeDelta = { retype: { field: string } };

/** Rename an AWSet (array-delta) field. Behaves like `rename` for keys. */
export type SetRenameDelta = { setRename: { from: string; to: string } };

export type LensDelta = RenameDelta | AddDelta | DropDelta | RetypeDelta | SetRenameDelta;

/** Whether the lens widens the wire (`expand`) or removes the old shape (`contract`). */
export type LensPhase = 'expand' | 'contract';

/** Minimal transform context surfaced to custom converters (doba-compatible subset). */
export interface LensContext {
  warn: (message: string) => void;
  defaulted: (path: readonly PropertyKey[], message: string) => void;
}

/** Escape hatch for changes a declarative `delta` cannot express (retype, splits/merges). */
export interface LensCustom {
  entityForward?: (entity: Record<string, unknown>, ctx: LensContext) => Record<string, unknown>;
  entityBackward?: (entity: Record<string, unknown>, ctx: LensContext) => Record<string, unknown>;
  opsConvert?: (ops: Record<string, unknown>) => Record<string, unknown>;
}

export interface LensDefinition {
  /** Stable, date-prefixed, globally-unique id, e.g. `2026-07-01-task-name-to-title`. */
  id: string;
  /** Product entity this lens applies to. */
  entityType: ProductEntityType;
  /** Human-readable summary of the change. */
  description: string;
  /** Lifecycle phase — drives wire widening and spec generation. */
  phase: LensPhase;
  /** Single declarative source of truth for the change. */
  delta: LensDelta;
  /** Optional custom converters when `delta` is insufficient (required for `retype`). */
  custom?: LensCustom;
  /** When true, backward migration omits the field instead of restoring it (security). */
  lossyBackward?: boolean;
}

const ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

/**
 * Validates and returns a frozen lens definition. Throws on malformed input so
 * mistakes surface at module load / test time rather than at runtime.
 */
export function defineLens(def: LensDefinition): LensDefinition {
  if (!ID_PATTERN.test(def.id)) {
    throw new Error(`Lens id "${def.id}" must be date-prefixed kebab-case, e.g. 2026-07-01-task-name-to-title`);
  }
  if ('retype' in def.delta && !def.custom?.opsConvert) {
    throw new Error(`Lens "${def.id}" uses a retype delta and must declare custom.opsConvert`);
  }
  return Object.freeze(def);
}

/** Field-key rename map (old → new) derived from a lens delta, or `null` when the delta renames nothing. */
export function deltaRenameMap(delta: LensDelta): { from: string; to: string } | null {
  if ('rename' in delta) return delta.rename;
  if ('setRename' in delta) return delta.setRename;
  return null;
}
