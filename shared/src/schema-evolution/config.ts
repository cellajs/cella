/**
 * What `normalizeOps` does with ops fields that are neither canonical nor a live expand-window
 * alias after lens mapping: `ignore` passes them through for Zod to judge, `strip` removes them,
 * `fail` throws. Detection needs the caller to pass `canonicalKeys`, but unknown fields are
 * reported in the result either way.
 */
export type UnknownFieldHandling = 'ignore' | 'strip' | 'fail';

/**
 * Timing for the manual expand-to-contract step (`cella/SCHEMA_EVOLUTION.md`); no code reads
 * `expandWindowMinDays` or `staleBundleMaxDays` yet. Pure constants with no runtime dependencies.
 */
export const schemaEvolutionPolicy: {
  /** Minimum days an expand-window lens must live before it may be contracted. */
  expandWindowMinDays: number;
  /** A bundle older than this many days must update before continuing (idle-gated). */
  staleBundleMaxDays: number;
  /** Policy for unmappable ops fields in `normalizeOps` (when `canonicalKeys` is provided). */
  unknownFieldHandling: UnknownFieldHandling;
} = { expandWindowMinDays: 14, staleBundleMaxDays: 30, unknownFieldHandling: 'strip' };
