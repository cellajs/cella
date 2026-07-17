/**
 * A single side-effect migration block for raw SQL that Drizzle Kit cannot express from the
 * schema diff (RLS grants, triggers, functions, publications, partitioning, …).
 *
 * Producers are PURE: they compute SQL from the schema and return it. They never touch the
 * `drizzle/` folder. A single collector (see `helpers/combine-side-effects.ts`) concatenates
 * every block into ONE combined migration folder per `pnpm generate` run. This keeps the
 * folder count flat as side-effects are added or removed.
 */
export interface SideEffectBlock {
  /**
   * Stable identifier, e.g. `rls_setup`. Used for the block's section header and log context,
   * and must be unique across all producers (the collector rejects duplicates).
   */
  tag: string;
  /** Human-readable section title rendered above the block in the combined SQL. */
  title: string;
  /**
   * The SQL for this block. Must be IDEMPOTENT: whenever ANY block changes, the collector
   * re-emits a folder that re-runs the whole set, so every block re-applies on that migrate.
   * Return an empty string to emit nothing (e.g. a fork that disabled this feature).
   * Do not add the auto-generated header or edge `--> statement-breakpoint`; the collector does.
   */
  sql: string;
  /** Optional human diagnostics printed after generation (table lists, function signatures, …). */
  notes?: string[];
}

/**
 * A side-effect migration producer, auto-discovered from `scripts/migrations/*.migration.ts`.
 * Export as `sideEffect` from any such file to auto-register. Files are sorted alphabetically
 * by filename; use numeric prefixes to control block order within the combined migration.
 */
export interface SideEffectProducer {
  /** Human-readable name (log label). */
  name: string;
  /**
   * Pure producer: computes SQL from the current schema and returns a block. The same schema
   * must produce the same SQL (sorted table lists; no Date/random in SQL), so unchanged runs
   * produce byte-identical output and never churn a new folder.
   */
  produce: () => SideEffectBlock | Promise<SideEffectBlock>;
}

/**
 * Configuration for a seed script run during `pnpm seed`.
 * Export as `seedConfig` from any `*.seed.ts` file in scripts/seeds/ to auto-register.
 * Files are sorted alphabetically by filename; use numeric prefixes to control order.
 */
export interface SeedScript {
  /** Unique name used as CLI target (eg `pnpm seed init`). */
  name: string;
  /** Seed function to execute. */
  run: () => Promise<void>;
  /** Allows this seed to run in production. Defaults to false. */
  allowProduction?: boolean;
}
