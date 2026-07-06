/**
 * Schema-evolution lifecycle policy.
 *
 * Centralizes the timing knobs that gate expand → contract transitions and
 * force stale bundles to update. Values are conservative defaults; forks tune
 * them. Pure constants — safe to import anywhere (no runtime deps).
 */
/**
 * What `normalizeOps` does with ops fields that are neither canonical nor a
 * live expand-window alias after lens mapping (per LiveStore's
 * `unknownEventHandling`): `ignore` passes them through (Zod validation decides),
 * `strip` removes them, `fail` throws. Detection requires the caller to pass
 * `canonicalKeys`; unknown fields are always reported in the result either way.
 */
export type UnknownFieldHandling = 'ignore' | 'strip' | 'fail';

export const schemaEvolutionPolicy: {
  /** Minimum days an expand-window lens must live before it may be contracted. */
  expandWindowMinDays: number;
  /** A bundle older than this many days must update before continuing (idle-gated). */
  staleBundleMaxDays: number;
  /** Policy for unmappable ops fields in `normalizeOps` (when `canonicalKeys` is provided). */
  unknownFieldHandling: UnknownFieldHandling;
} = {
  expandWindowMinDays: 14,
  staleBundleMaxDays: 30,
  unknownFieldHandling: 'strip',
};
