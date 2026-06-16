/**
 * Self-registration registry for extensible bench seed targets.
 *
 * Mirrors the cella module/tag registry pattern (shared/src/module-registry.ts):
 * each seed module calls `registerBenchSeed()` as an import side effect.
 * `data-setup.ts` auto-imports every `*.bench.ts` file under seeds/, so core
 * and fork seeds register without editing any shared file — a fork load-tests a new
 * table (entity OR resource) by dropping in a single new file.
 *
 * The contract supports ordinary table row seeds plus custom lifecycle hooks for
 * targets that need bespoke SQL (for example tenant upserts or cleanup-only rows).
 */

import type pg from 'pg';

export interface BenchSeedContext {
  now: string;
  pool: pg.Pool;
}

export interface BenchCleanupContext {
  client: pg.PoolClient;
}

export interface TableBenchSeed {
  kind?: 'table';
  /** Target database table — also used for dedup and seed/cleanup logging. */
  table: string;
  /**
   * Columns kept as native Postgres arrays instead of JSON-stringified.
   * Snake_case column names (e.g. `'languages'`).
   */
  pgArrayColumns?: string[];
  /** Seed order within the extensible tier (lower seeds first). Core uses <100, forks ≥100. */
  order: number;
  /** SQL WHERE fragment identifying this seed's rows for cleanup (e.g. `"key LIKE 'xbench-%'"`). */
  cleanupWhere: string;
  /**
   * Produce records to insert. `now` is an ISO timestamp shared across the seed run.
   * INSERT columns are derived from each record's keys (camelCase → snake_case), so
   * generators should return typed insert records whose keys are real columns.
   */
  rows: (ctx: BenchSeedContext) => Record<string, unknown>[];
}

export interface CustomBenchSeed {
  kind: 'custom';
  /** Logical seed name — used for dedup and seed/cleanup logging. */
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

export const getBenchSeedName = (seed: BenchSeed): string => (seed.kind === 'custom' ? seed.name : seed.table);

/** Register a bench seed target. Idempotent by table. */
export const registerBenchSeed = (seed: BenchSeed): void => {
  const name = getBenchSeedName(seed);
  if (!seeds.some((s) => getBenchSeedName(s) === name)) seeds.push(seed);
};

/** All registered seeds, sorted by seed order. */
export const getBenchSeeds = (): BenchSeed[] => [...seeds].sort((a, b) => a.order - b.order);
