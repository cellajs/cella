import { createRegistry, type Registry, type RegistryHooks } from 'dobajs';
import { schemaEvolutionPolicy, type UnknownFieldHandling } from './config';
import { deltaRenameMap, type LensContext, type LensDefinition, type LensEntityType, resolveAddDefault } from './define';
import { lenses } from './lens-list';

/** Re-exported doba type so telemetry consumers don't import dobajs directly. */
export type { RegistryHooks } from 'dobajs';

type AnyRecord = Record<string, unknown>;

/** Permissive Standard Schema node: transforms always run with `validate: 'none'`. */
const passthroughSchema = {
  '~standard': {
    version: 1 as const,
    vendor: 'cella',
    validate: (value: unknown) => ({ value }),
  },
};

/** Optional telemetry hooks injected by the host (server wires otel; client stays bare). */
let registryHooks: RegistryHooks<string> | undefined;

/** Inject doba lifecycle hooks (otel). Call once at startup before first migration. */
export function configureLensTelemetry(hooks: RegistryHooks<string>): void {
  registryHooks = hooks;
}

/** Global schema version = lens count (monotonic, append-only). */
export const currentSchemaVersion: number = lenses.length;

/** Lenses for an entity, paired with their 1-based global ordinal, in order. */
function lensesFor(entityType: LensEntityType): { lens: LensDefinition; ordinal: number }[] {
  const result: { lens: LensDefinition; ordinal: number }[] = [];
  lenses.forEach((lens, i) => {
    if (lens.entityType === entityType) result.push({ lens, ordinal: i + 1 });
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

function currentNode(entityType: LensEntityType): string {
  const last = lensesFor(entityType).at(-1);
  return last === undefined ? 'v0' : `v${last.ordinal}`;
}

// ── Entity (whole-row) migrations, including stx.fieldTimestamps key rewrites ──

function renameKeyDeep(entity: AnyRecord, from: string, to: string): AnyRecord {
  let next = entity;
  if (from in next) {
    const { [from]: value, ...rest } = next;
    next = { ...rest, [to]: value };
  }
  const stx = next.stx as AnyRecord | undefined;
  const ft = stx?.fieldTimestamps as AnyRecord | undefined;
  if (ft && from in ft) {
    const { [from]: ts, ...restFt } = ft;
    next = { ...next, stx: { ...stx, fieldTimestamps: { ...restFt, [to]: ts } } };
  }
  return next;
}

function dropKeyDeep(entity: AnyRecord, field: string): AnyRecord {
  let next = entity;
  if (field in next) {
    const { [field]: _omit, ...rest } = next;
    next = rest;
  }
  const stx = next.stx as AnyRecord | undefined;
  const ft = stx?.fieldTimestamps as AnyRecord | undefined;
  if (ft && field in ft) {
    const { [field]: _omitTs, ...restFt } = ft;
    next = { ...next, stx: { ...stx, fieldTimestamps: restFt } };
  }
  return next;
}

type DobaCtx = LensContext & { from: string; to: string };

function buildEntityMigration(lens: LensDefinition): {
  forward: (value: AnyRecord, ctx: DobaCtx) => AnyRecord;
  backward: (value: AnyRecord, ctx: DobaCtx) => AnyRecord;
} {
  const { delta, custom } = lens;
  const rename = deltaRenameMap(delta);

  if (custom?.entityForward || custom?.entityBackward) {
    const fwd = custom.entityForward ?? ((v: AnyRecord) => v);
    const bwd = custom.entityBackward ?? ((v: AnyRecord) => v);
    return { forward: (v, ctx) => fwd(v, ctx), backward: (v, ctx) => bwd(v, ctx) };
  }

  if (rename) {
    return {
      forward: (v) => renameKeyDeep(v, rename.from, rename.to),
      backward: (v) => renameKeyDeep(v, rename.to, rename.from),
    };
  }

  if ('add' in delta) {
    const add = delta.add;
    return {
      forward: (v, ctx) => {
        if (add.field in v) return v;
        ctx.defaulted([add.field], `lens ${lens.id}: filled "${add.field}" with default`);
        return { ...v, [add.field]: resolveAddDefault(add, v) };
      },
      backward: (v) => dropKeyDeep(v, add.field),
    };
  }

  if ('drop' in delta) {
    const { field } = delta.drop;
    return {
      // backward is lossy by construction: the value is gone.
      forward: (v) => dropKeyDeep(v, field),
      backward: (v, ctx) => {
        if (lens.lossyBackward) return v;
        ctx.warn(`lens ${lens.id}: cannot restore dropped field "${field}"`);
        return v;
      },
    };
  }

  // retype without custom converters is rejected at defineLens time.
  return { forward: (v) => v, backward: (v) => v };
}

// ── Lazy per-entity doba registry ──

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
  let prev = 'v0';
  for (const { lens, ordinal } of entityLenses) {
    const node = `v${ordinal}`;
    schemas[node] = passthroughSchema;
    const { forward, backward } = buildEntityMigration(lens);
    migrations[`${prev}<->${node}`] = { forward, backward };
    prev = node;
  }

  // biome-ignore lint/suspicious/noExplicitAny: doba's generic migration map is keyed dynamically.
  const registry = createRegistry({ schemas, migrations: migrations as any, hooks: registryHooks }) as Registry<
    Record<string, typeof passthroughSchema>
  >;
  registryCache.set(entityType, registry);
  return registry;
}

/** Clears memoized registries. Test-only, after telemetry/lens reconfiguration. */
export function resetLensEngine(): void {
  registryCache.clear();
}

// ── Public API ──

/**
 * Migrate a cached entity row from a persisted global version up to current.
 * Idempotent: re-running over already-migrated rows is a no-op. Async because
 * doba's `transform` is async.
 */
export async function migrateCachedEntity<T extends AnyRecord>(
  entityType: LensEntityType,
  entity: T,
  fromVersion: number,
): Promise<T> {
  const registry = getRegistry(entityType);
  if (!registry) return entity;
  const from = versionNodeFor(entityType, fromVersion);
  const to = currentNode(entityType);
  if (from === to) return entity;
  const result = await registry.transform(entity, from, to, { validate: 'none' });
  return result.ok ? (result.value as T) : entity;
}

/**
 * Phase 2 only: down-migrate a current-shape entity to an older peer version.
 * `lossyBackward` lenses keep removed fields absent during backward migration.
 */
export async function downgradeEntity<T extends AnyRecord>(
  entityType: LensEntityType,
  entity: T,
  toVersion: number,
): Promise<T> {
  const registry = getRegistry(entityType);
  if (!registry) return entity;
  const from = currentNode(entityType);
  const to = versionNodeFor(entityType, toVersion);
  if (from === to) return entity;
  const result = await registry.transform(entity, from, to, { validate: 'none' });
  return result.ok ? (result.value as T) : entity;
}

interface StxLike {
  fieldTimestamps?: Record<string, unknown>;
  [key: string]: unknown;
}

/** Options for `normalizeOps` unknown-field detection. */
export interface NormalizeOpsOptions {
  /**
   * Canonical field names of the entity's current ops schema. When provided,
   * ops keys that are neither canonical nor a live expand-window alias after
   * lens mapping are handled per `unknownFieldHandling` and reported.
   */
  canonicalKeys?: ReadonlySet<string>;
  /** Per-call override of `schemaEvolutionPolicy.unknownFieldHandling`. */
  unknownFieldHandling?: UnknownFieldHandling;
}

/**
 * Server seam (runtime touch point 1): normalize old-shape `ops` + `stx.fieldTimestamps`
 * to canonical keys, then mirror-write the twin field during expand windows so old
 * readers stay fresh. No-op when the entity has no lenses.
 */
export function normalizeOps<O extends AnyRecord, S extends StxLike>(
  entityType: LensEntityType,
  ops: O,
  stx: S,
  options?: NormalizeOpsOptions,
): { ops: O; stx: S; unknownFields: string[] } {
  const entityLenses = lensesFor(entityType);
  if (entityLenses.length === 0) return { ops, stx, unknownFields: [] };

  let nextOps: AnyRecord = { ...ops };
  const ft: Record<string, unknown> | undefined = stx.fieldTimestamps ? { ...stx.fieldTimestamps } : undefined;
  let ftTouched = false;

  for (const { lens } of entityLenses) {
    const rename = deltaRenameMap(lens.delta);
    if (rename) {
      if (rename.from in nextOps) {
        nextOps[rename.to] = nextOps[rename.from];
        delete nextOps[rename.from];
      }
      if (ft && rename.from in ft) {
        ft[rename.to] = ft[rename.from];
        delete ft[rename.from];
        ftTouched = true;
      }
      // Mirror-write the old twin during expand so old bundles keep reading fresh data.
      if (lens.phase === 'expand') {
        if (rename.to in nextOps) nextOps[rename.from] = nextOps[rename.to];
        if (ft && rename.to in ft) {
          ft[rename.from] = ft[rename.to];
          ftTouched = true;
        }
      }
    } else if ('drop' in lens.delta) {
      const field = lens.delta.drop.field;
      if (field in nextOps) delete nextOps[field];
      if (ft && field in ft) {
        delete ft[field];
        ftTouched = true;
      }
    } else if ('retype' in lens.delta && lens.custom?.opsConvert) {
      nextOps = lens.custom.opsConvert(nextOps);
    }
  }

  // Unknown-field policy: keys that survived lens mapping but are neither
  // canonical nor an intentional expand-window twin.
  const unknownFields: string[] = [];
  if (options?.canonicalKeys) {
    const expandAliases = new Set<string>();
    for (const { lens } of entityLenses) {
      if (lens.phase !== 'expand') continue;
      const rename = deltaRenameMap(lens.delta);
      if (rename) expandAliases.add(rename.from);
    }
    for (const key of Object.keys(nextOps)) {
      if (!options.canonicalKeys.has(key) && !expandAliases.has(key)) unknownFields.push(key);
    }
    if (unknownFields.length > 0) {
      const handling = options.unknownFieldHandling ?? schemaEvolutionPolicy.unknownFieldHandling;
      if (handling === 'fail') {
        throw new Error(`normalizeOps(${entityType}): unmappable fields after lens chain: ${unknownFields.join(', ')}`);
      }
      if (handling === 'strip') {
        for (const key of unknownFields) {
          delete nextOps[key];
          if (ft && key in ft) {
            delete ft[key];
            ftTouched = true;
          }
        }
      }
    }
  }

  const nextStx = ftTouched && ft ? ({ ...stx, fieldTimestamps: ft } as S) : stx;
  return { ops: nextOps as O, stx: nextStx, unknownFields };
}

/**
 * Client seam: rewrite a queued mutation's variables from its persisted global
 * version up to current canonical keys (applied to top-level keys, `ops`, and
 * `stx.fieldTimestamps`). Sync: pure key renames.
 */
export function migrateQueuedMutation<V extends AnyRecord>(
  entityType: LensEntityType,
  variables: V,
  fromVersion: number,
): V {
  const pending = lensesFor(entityType).filter(({ ordinal }) => ordinal > fromVersion);
  if (pending.length === 0) return variables;

  const renameRecord = (record: AnyRecord, from: string, to: string): AnyRecord => {
    if (!(from in record)) return record;
    const { [from]: value, ...rest } = record;
    return { ...rest, [to]: value };
  };

  let next: AnyRecord = { ...variables };
  for (const { lens } of pending) {
    const rename = deltaRenameMap(lens.delta);
    if (!rename) {
      if ('drop' in lens.delta) {
        const field = lens.delta.drop.field;
        if (field in next) {
          const { [field]: _omit, ...rest } = next;
          next = rest;
        }
      }
      continue;
    }
    next = renameRecord(next, rename.from, rename.to);
    if (next.ops && typeof next.ops === 'object') {
      next = { ...next, ops: renameRecord(next.ops as AnyRecord, rename.from, rename.to) };
    }
    const stx = next.stx as AnyRecord | undefined;
    const ft = stx?.fieldTimestamps as AnyRecord | undefined;
    if (ft && rename.from in ft) {
      next = { ...next, stx: { ...stx, fieldTimestamps: renameRecord(ft, rename.from, rename.to) } };
    }
  }
  return next as V;
}

/**
 * Build-time helper: old→new key alias map for an entity's active expand lenses.
 * Consumed by ops/create wire-schema widening (and tests). Empty when no expand lenses.
 */
export function widenedOpsKeyMap(entityType: LensEntityType): Record<string, string> {
  const map: Record<string, string> = {};
  for (const { lens } of lensesFor(entityType)) {
    if (lens.phase !== 'expand') continue;
    const rename = deltaRenameMap(lens.delta);
    if (rename) map[rename.from] = rename.to;
  }
  return map;
}
