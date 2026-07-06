/**
 * Schema-evolution lens registry — public barrel.
 *
 * The ordered, append-only lens list lives in `lens-list.ts` (the designated
 * append point). `currentSchemaVersion` is derived as the list length (engine.ts).
 */
export { lenses } from './lens-list';
export { schemaEvolutionPolicy, type UnknownFieldHandling } from './config';
export { defineLens, LENS_FORMAT_VERSION, resolveAddDefault } from './define';
export type {
  AddDelta,
  DropDelta,
  LensContext,
  LensCustom,
  LensDefinition,
  LensDelta,
  LensPhase,
  RenameDelta,
  RetypeDelta,
  SetRenameDelta,
} from './define';
export {
  configureLensTelemetry,
  currentSchemaVersion,
  downgradeEntity,
  migrateCachedEntity,
  migrateQueuedMutation,
  normalizeOps,
  resetLensEngine,
  versionNodeFor,
  widenedOpsKeyMap,
} from './engine';
export type { NormalizeOpsOptions, RegistryHooks } from './engine';
