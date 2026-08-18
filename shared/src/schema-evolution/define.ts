import type { ChannelEntityType, ProductEntityType } from '../../types.ts';

/**
 * Product entities get the full artifact set (ops/stx normalization, mirror writes). Channel
 * entities get body widening, normalization and cache migration only, because their writes are
 * full-body PUTs with no per-field merge.
 */
export type LensEntityType = ProductEntityType | ChannelEntityType;

/**
 * Version of the lens-module format. Lens modules are append-only and permanent, so the engine
 * branches on `lens.formatVersion` to tell which format a frozen module was written against.
 * Bump on an incompatible LensDefinition change.
 */
export const LENS_FORMAT_VERSION = 1;

/** Rename a scalar field: `from` (old canonical) → `to` (new canonical). */
export type RenameDelta = { rename: { from: string; to: string } };

/**
 * `default` fills the value when migrating older rows forward: a plain value, or a pure
 * `(row) => value` function that must pass the lens purity lint (no I/O, no dynamic key access).
 */
export type AddDelta = { add: { field: string; default: unknown } };

export function resolveAddDefault(add: AddDelta['add'], row: Record<string, unknown>): unknown {
  return typeof add.default === 'function'
    ? (add.default as (row: Record<string, unknown>) => unknown)(row)
    : add.default;
}

/** Drop a field. Backward migration cannot restore the value (lossy). */
export type DropDelta = { drop: { field: string } };

/** Change a field's type. Requires `custom` converters (delta alone can't express it). */
export type RetypeDelta = { retype: { field: string } };

/** Rename an AWSet (array-delta) field. Behaves like `rename` for keys. */
export type SetRenameDelta = { setRename: { from: string; to: string } };

export type LensDelta = RenameDelta | AddDelta | DropDelta | RetypeDelta | SetRenameDelta;

/** Whether the lens widens the wire (`expand`) or removes the old shape (`contract`). */
export type LensPhase = 'expand' | 'contract';

/** The doba-compatible subset custom converters receive. */
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
  /** Lens-module format version. Omit to get the current `LENS_FORMAT_VERSION`; frozen with the module. */
  formatVersion?: number;
  entityType: LensEntityType;
  /** Human-readable summary of the change. */
  description: string;
  /** Lifecycle phase: drives wire widening and spec generation. */
  phase: LensPhase;
  delta: LensDelta;
  /** Optional custom converters when `delta` is insufficient (required for `retype`). */
  custom?: LensCustom;
  /** When true, backward migration omits the field to prevent restoring sensitive data. */
  lossyBackward?: boolean;
}

const ID_PATTERN = /^\d{4}-\d{2}-\d{2}-[a-z0-9-]+$/;

/** Returns a frozen definition. Throws on malformed input, at module load and in tests. */
export function defineLens(def: LensDefinition): LensDefinition {
  if (!ID_PATTERN.test(def.id)) {
    throw new Error(`Lens id "${def.id}" must be date-prefixed kebab-case, e.g. 2026-07-01-task-name-to-title`);
  }
  const formatVersion = def.formatVersion ?? LENS_FORMAT_VERSION;
  if (!Number.isInteger(formatVersion) || formatVersion < 1 || formatVersion > LENS_FORMAT_VERSION) {
    throw new Error(
      `Lens "${def.id}" declares unsupported formatVersion ${def.formatVersion} (current: ${LENS_FORMAT_VERSION})`,
    );
  }
  if ('retype' in def.delta && !def.custom?.opsConvert) {
    throw new Error(`Lens "${def.id}" uses a retype delta and must declare custom.opsConvert`);
  }
  return Object.freeze({ ...def, formatVersion });
}

/** Old to new field keys, or `null` when the delta renames nothing. */
export function deltaRenameMap(delta: LensDelta): { from: string; to: string } | null {
  if ('rename' in delta) return delta.rename;
  if ('setRename' in delta) return delta.setRename;
  return null;
}
