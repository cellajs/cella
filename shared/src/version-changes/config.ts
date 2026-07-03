/**
 * Schema-evolution lifecycle policy.
 *
 * Centralizes the timing knobs that gate expand → contract transitions and
 * force stale bundles to update. Values are conservative defaults; forks tune
 * them. Pure constants — safe to import anywhere (no runtime deps).
 */
export const schemaEvolutionPolicy = {
  /** Minimum days an expand-window lens must live before it may be contracted. */
  expandWindowMinDays: 14,
  /** A bundle older than this many days must update before continuing (idle-gated). */
  staleBundleMaxDays: 30,
} as const;
