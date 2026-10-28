import { createRegistry, type Registry, type RegistryHooks } from 'dobajs';
import { isRecord } from '../utils/as-record.ts';
import { type AddDelta, deltaRenameMap, type LensContext, type LensDefinition, type LensEntityType } from './define.ts';
import { lenses } from './lens-list.ts';

/** Re-exported so telemetry callers need no direct dobajs import. */
export type { RegistryHooks } from 'dobajs';

type AnyRecord = Record<string, unknown>;

/** Permissive Standard Schema node: transforms always run with `validate: 'none'`. */
const passthroughSchema = {
  '~standard': { version: 1 as const, vendor: 'schema-evolution', validate: (value: unknown) => ({ value }) },
};

/** Injected by the host: the server passes otel hooks, the client passes none. */
let registryHooks: RegistryHooks<string> | undefined;

/** Call once at startup, before the first migration. */
export function configureLensTelemetry(hooks: RegistryHooks<string>): void {
  registryHooks = hooks;
}

/** Lens count: monotonic and append-only. */
export const currentSchemaVersion: number = lenses.length;

/** Paired with their 1-based global ordinal, in order. */
function lensesFor(entityType: LensEntityType): { lens: LensDefinition; ordinal: number }[] {
  const result: { lens: LensDefinition; ordinal: number }[] = [];
  lenses.forEach((lens, index) => {
    if (lens.entityType === entityType) result.push({ lens, ordinal: index + 1 });
  });
  return result;
}

/** Version node id for a global version (latest entity ordinal ≤ version, else `v0`). */
export function versionNodeFor(entityType: LensEntityType, globalVersion: number): string {
  const entityLenses = lensesFor(entityType);
  let node = 'v0';
  for (const { ordinal } of entityLenses) {
    if (ordinal <= globalVersion) node = `v${ordinal}`;
    else break;
  }
  return node;
}

/** `record` with `from` renamed to `to`; the same object when it has no `from`. */
function renameKey(record: AnyRecord, from: string, to: string): AnyRecord {
  if (!(from in record)) return record;
  const { [from]: value, ...rest } = record;
  return { ...rest, [to]: value };
}

/** `record` without `field`; the same object when it has none. */
function dropKey(record: AnyRecord, field: string): AnyRecord {
  if (!(field in record)) return record;
  const { [field]: _omit, ...rest } = record;
  return rest;
}

/** `record` with `change` applied to its `stx.fieldTimestamps`; the same object when that changes nothing. */
function changeFieldTimestamps(record: AnyRecord, change: (fieldTimestamps: AnyRecord) => AnyRecord): AnyRecord {
  const stx = record.stx as AnyRecord | undefined;
  const fieldTimestamps = stx?.fieldTimestamps as AnyRecord | undefined;
  if (!fieldTimestamps) return record;
  const changed = change(fieldTimestamps);
  return changed === fieldTimestamps ? record : { ...record, stx: { ...stx, fieldTimestamps: changed } };
}

function renameKeyDeep(entity: AnyRecord, from: string, to: string): AnyRecord {
  return changeFieldTimestamps(renameKey(entity, from, to), (fieldTimestamps) => renameKey(fieldTimestamps, from, to));
}

function dropKeyDeep(entity: AnyRecord, field: string): AnyRecord {
  return changeFieldTimestamps(dropKey(entity, field), (fieldTimestamps) => dropKey(fieldTimestamps, field));
}

/** An `add` lens's value for a row: its plain default, or what its default function computes from the row. */
function resolveAddDefault(add: AddDelta['add'], row: AnyRecord): unknown {
  return typeof add.default === 'function' ? (add.default as (row: AnyRecord) => unknown)(row) : add.default;
}

type DobaContext = LensContext & { from: string; to: string };

const unchanged = (entity: AnyRecord): AnyRecord => entity;

function buildEntityMigration(lens: LensDefinition): {
  forward: (entity: AnyRecord, ctx: DobaContext) => AnyRecord;
  backward: (entity: AnyRecord, ctx: DobaContext) => AnyRecord;
} {
  const { delta, custom } = lens;
  const rename = deltaRenameMap(delta);

  if (custom?.entityForward || custom?.entityBackward) {
    return { forward: custom.entityForward ?? unchanged, backward: custom.entityBackward ?? unchanged };
  }

  if (rename) {
    return {
      forward: (entity) => renameKeyDeep(entity, rename.from, rename.to),
      backward: (entity) => renameKeyDeep(entity, rename.to, rename.from),
    };
  }

  if ('add' in delta) {
    const add = delta.add;
    return {
      forward: (entity, ctx) => {
        if (add.field in entity) return entity;
        ctx.defaulted([add.field], `lens ${lens.id}: filled "${add.field}" with default`);
        return { ...entity, [add.field]: resolveAddDefault(add, entity) };
      },
      backward: (entity) => dropKeyDeep(entity, add.field),
    };
  }

  if ('drop' in delta) {
    const { field } = delta.drop;
    return {
      // backward is lossy by construction: the value is gone.
      forward: (entity) => dropKeyDeep(entity, field),
      backward: (entity, ctx) => {
        if (lens.lossyBackward) return entity;
        ctx.warn(`lens ${lens.id}: cannot restore dropped field "${field}"`);
        return entity;
      },
    };
  }

  // retype without custom converters is rejected at defineLens time.
  return { forward: unchanged, backward: unchanged };
}

const registryCache = new Map<LensEntityType, Registry<Record<string, typeof passthroughSchema>> | null>();

function getRegistry(entityType: LensEntityType): Registry<Record<string, typeof passthroughSchema>> | null {
  if (registryCache.has(entityType)) return registryCache.get(entityType) ?? null;

  const entityLenses = lensesFor(entityType);
  if (entityLenses.length === 0) {
    registryCache.set(entityType, null);
    return null;
  }

  const schemas: Record<string, typeof passthroughSchema> = { v0: passthroughSchema };
  const migrations: Record<string, { forward: unknown; backward: unknown }> = {};
  let previousNode = 'v0';
  for (const { lens, ordinal } of entityLenses) {
    const node = `v${ordinal}`;
    schemas[node] = passthroughSchema;
    migrations[`${previousNode}<->${node}`] = buildEntityMigration(lens);
    previousNode = node;
  }

  // biome-ignore lint/suspicious/noExplicitAny: doba's generic migration map is keyed dynamically.
  const registry = createRegistry({ schemas, migrations: migrations as any, hooks: registryHooks }) as Registry<
    Record<string, typeof passthroughSchema>
  >;
  registryCache.set(entityType, registry);
  return registry;
}

/** Test-only, after telemetry or lens reconfiguration. */
export function resetLensEngine(): void {
  registryCache.clear();
}

/** Moves a row between two version nodes; the row as given when the entity has no lenses or the transform fails. */
async function transformEntity<T extends AnyRecord>(entityType: LensEntityType, entity: T, from: string, to: string): Promise<T> {
  const registry = getRegistry(entityType);
  if (!registry || from === to) return entity;
  const result = await registry.transform(entity, from, to, { validate: 'none' });
  return result.ok ? (result.value as T) : entity;
}

/** Idempotent: re-running over already-migrated rows changes nothing. */
export function migrateCachedEntity<T extends AnyRecord>(entityType: LensEntityType, entity: T, fromVersion: number): Promise<T> {
  return transformEntity(entityType, entity, versionNodeFor(entityType, fromVersion), versionNodeFor(entityType, currentSchemaVersion));
}

/** Phase 2 only. `lossyBackward` lenses keep removed fields absent going backward. */
export function downgradeEntity<T extends AnyRecord>(entityType: LensEntityType, entity: T, toVersion: number): Promise<T> {
  return transformEntity(entityType, entity, versionNodeFor(entityType, currentSchemaVersion), versionNodeFor(entityType, toVersion));
}

interface StxLike {
  fieldTimestamps?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Server entry point: maps old-shape `ops` and `stx.fieldTimestamps` to canonical keys, then
 * mirror-writes the twin field during expand windows so old readers stay fresh. Does nothing
 * when the entity has no lenses.
 */
export function normalizeOps<O extends AnyRecord, S extends StxLike>(entityType: LensEntityType, ops: O, stx: S): { ops: O; stx: S } {
  const entityLenses = lensesFor(entityType);
  if (entityLenses.length === 0) return { ops, stx };

  let nextOps: AnyRecord = { ...ops };
  const fieldTimestamps: Record<string, unknown> | undefined = stx.fieldTimestamps ? { ...stx.fieldTimestamps } : undefined;
  let fieldTimestampsChanged = false;

  for (const { lens } of entityLenses) {
    const rename = deltaRenameMap(lens.delta);
    if (rename) {
      if (rename.from in nextOps) {
        nextOps[rename.to] = nextOps[rename.from];
        delete nextOps[rename.from];
      }
      if (fieldTimestamps && rename.from in fieldTimestamps) {
        fieldTimestamps[rename.to] = fieldTimestamps[rename.from];
        delete fieldTimestamps[rename.from];
        fieldTimestampsChanged = true;
      }
      // Mirror-write the old twin during expand so old bundles keep reading fresh data.
      if (lens.phase === 'expand') {
        if (rename.to in nextOps) nextOps[rename.from] = nextOps[rename.to];
        if (fieldTimestamps && rename.to in fieldTimestamps) {
          fieldTimestamps[rename.from] = fieldTimestamps[rename.to];
          fieldTimestampsChanged = true;
        }
      }
    } else if ('drop' in lens.delta) {
      const field = lens.delta.drop.field;
      delete nextOps[field];
      if (fieldTimestamps && field in fieldTimestamps) {
        delete fieldTimestamps[field];
        fieldTimestampsChanged = true;
      }
    } else if ('retype' in lens.delta && lens.custom?.opsConvert) {
      nextOps = lens.custom.opsConvert(nextOps);
    }
  }

  const nextStx = fieldTimestampsChanged && fieldTimestamps ? ({ ...stx, fieldTimestamps } as S) : stx;
  return { ops: nextOps as O, stx: nextStx };
}

/**
 * Client entry point: rewrites a queued mutation's variables from its persisted global version
 * to current canonical keys, across `ops`, `stx.fieldTimestamps` and the rows the variables hold:
 * under `data` for a create and `rows` for a delete, or the variables themselves where they are one row.
 */
export function migrateQueuedMutation<V extends AnyRecord>(entityType: LensEntityType, variables: V, fromVersion: number): V {
  const pending = lensesFor(entityType).filter(({ ordinal }) => ordinal > fromVersion);
  if (pending.length === 0) return variables;

  /** Applies a change to each row the variables hold. A holder keeps its key, whatever a column of that name becomes. */
  const inRows = (record: AnyRecord, change: (row: AnyRecord) => AnyRecord): AnyRecord => {
    // A top-level id without ops: the variables are one row themselves, and `data` or `rows` are its columns.
    if (typeof record.id === 'string' && !('ops' in record)) return change(record);
    const changed = { ...record };
    for (const key of ['data', 'rows']) {
      const held = record[key];
      if (Array.isArray(held)) changed[key] = held.map((row) => (isRecord(row) ? change(row) : row));
      else if (isRecord(held)) changed[key] = change(held);
    }
    return changed;
  };

  let next: AnyRecord = { ...variables };
  for (const { lens } of pending) {
    const rename = deltaRenameMap(lens.delta);
    if (!rename) {
      if ('drop' in lens.delta) {
        const field = lens.delta.drop.field;
        next = inRows(next, (row) => dropKey(row, field));
      }
      continue;
    }
    next = inRows(next, (row) => renameKey(row, rename.from, rename.to));
    if (next.ops && typeof next.ops === 'object') {
      next = { ...next, ops: renameKey(next.ops as AnyRecord, rename.from, rename.to) };
    }
    next = changeFieldTimestamps(next, (fieldTimestamps) => renameKey(fieldTimestamps, rename.from, rename.to));
  }
  return next as V;
}

/** Old to new key aliases for an entity's active expand lenses, read by wire-schema widening. */
export function widenedOpsKeyMap(entityType: LensEntityType): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { lens } of lensesFor(entityType)) {
    if (lens.phase !== 'expand') continue;
    const rename = deltaRenameMap(lens.delta);
    if (rename) map[rename.from] = rename.to;
  }
  return map;
}
