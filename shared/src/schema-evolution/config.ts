/**
 * Timing for the manual expand-to-contract step (`cella/SCHEMA_EVOLUTION.md`); no code reads
 * `expandWindowMinDays` or `staleBundleMaxDays` yet. Pure constants with no runtime dependencies.
 */
export const schemaEvolutionPolicy: {
  /** Minimum days an expand-window lens must live before it may be contracted. */
  expandWindowMinDays: number;
  /** A bundle older than this many days must update before continuing (idle-gated). */
  staleBundleMaxDays: number;
} = { expandWindowMinDays: 14, staleBundleMaxDays: 30 };
