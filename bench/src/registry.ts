import type pg from 'pg';
import { BENCH_UUID_PREFIX } from 'shared/bench-identity';

export interface BenchSeedContext {
  now: string;
  pool: pg.Pool;
}

export interface BenchCleanupContext {
  client: pg.PoolClient;
}

export interface TableBenchSeed {
  kind?: 'table';
  /** Target database table, also used for dedup and seed/cleanup logging. */
  table: string;
  /**
   * Columns kept as native Postgres arrays instead of JSON-stringified.
   * Snake_case column names (e.g. `'languages'`).
   */
  pgArrayColumns?: string[];
  /** Seed order within the extensible tier (lower seeds first). Core uses <100, forks ≥100. */
  order: number;
  /**
   * Variant byte (UUID group-4, e.g. `'a005'`) for every id minted by this seed.
   * When set, the cleanup predicate is derived as
   * `id::text LIKE '<BENCH_UUID_PREFIX><idVariant>%'`, keeping the id helper and
   * cleanup in sync from one value. Core seeds use the `a*` band; forks use `b*`.
   */
  idVariant?: string;
  /**
   * Explicit cleanup predicate: use only when rows aren't identified by an id
   * variant (e.g. `"tenant_id = '...'"`). Prefer `idVariant` for id-based rows.
   */
  cleanupWhere?: string;
  /**
   * Produce rows to insert. `now` is an ISO timestamp shared across the seed run.
   * INSERT columns are derived from each row's keys (camelCase → snake_case), so
   * generators should return typed insert rows whose keys are real columns.
   */
  rows: (ctx: BenchSeedContext) => Record<string, unknown>[];
}

export interface CustomBenchSeed {
  kind: 'custom';
  /** Logical seed name, used for dedup and seed/cleanup logging. */
  name: string;
  /** Seed order (lower seeds first; cleanup runs in reverse order). */
  order: number;
  /** Optional cleanup hook for rows not covered by a simple table predicate. */
  cleanup?: (ctx: BenchCleanupContext) => Promise<void>;
  /** Optional seed hook for non-row inserts/upserts. */
  seed?: (ctx: BenchSeedContext) => Promise<void>;
}

export type BenchSeed = TableBenchSeed | CustomBenchSeed;

const seeds: BenchSeed[] = [];

/** Valid RFC-4122 UUID variant byte: 4 hex chars starting with 8, 9, a or b. */
const VARIANT_PATTERN = /^[89ab][0-9a-f]{3}$/;

export const getBenchSeedName = (seed: BenchSeed): string => (seed.kind === 'custom' ? seed.name : seed.table);

/** Derive the cleanup WHERE predicate for a table seed from its `idVariant`, or fall back to an explicit `cleanupWhere`. */
export const getBenchSeedCleanupWhere = (seed: TableBenchSeed): string => {
  if (seed.idVariant) return `id::text LIKE '${BENCH_UUID_PREFIX}${seed.idVariant}%'`;
  if (seed.cleanupWhere) return seed.cleanupWhere;
  throw new Error(`Bench seed '${seed.table}' must define either 'idVariant' or 'cleanupWhere' for cleanup.`);
};

/**
 * Registers a bench seed target as an import side effect (mirrors the cella
 * module/tag registry pattern in `shared/src/module-registry.ts`); `data-setup.ts`
 * auto-imports every `*.bench.ts` file under seeds/, so a fork adds a load-test
 * table by dropping in one file. See `seeds/README.md` for the identity-band
 * contract. Idempotent by name; rejects malformed or duplicate id variants.
 */
export const registerBenchSeed = (seed: BenchSeed): void => {
  const name = getBenchSeedName(seed);
  if (seeds.some((s) => getBenchSeedName(s) === name)) return;

  if (seed.kind !== 'custom' && seed.idVariant) {
    const variant = seed.idVariant;
    if (!VARIANT_PATTERN.test(variant)) {
      throw new Error(
        `Bench seed '${name}' has an invalid idVariant '${variant}'. Use a 4-hex-char UUID variant byte starting with 8, 9, a or b (core: a*, forks: b*).`,
      );
    }
    const clash = seeds.find((s) => s.kind !== 'custom' && s.idVariant === variant);
    if (clash) {
      throw new Error(
        `Bench seed '${name}' reuses idVariant '${variant}' already claimed by '${getBenchSeedName(clash)}'. Pick a unique variant (core: a*, forks: b*).`,
      );
    }
  }

  seeds.push(seed);
};

/** All registered seeds, sorted by seed order. */
export const getBenchSeeds = (): BenchSeed[] => [...seeds].sort((a, b) => a.order - b.order);
