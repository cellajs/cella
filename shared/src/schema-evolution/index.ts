/**
 * Public barrel for the schema-evolution lens registry.
 *
 * @see README.md
 */

export { schemaEvolutionPolicy, type UnknownFieldHandling } from './config.ts';
export type {
  AddDelta,
  DropDelta,
  LensContext,
  LensCustom,
  LensDefinition,
  LensDelta,
  LensEntityType,
  LensPhase,
  RenameDelta,
  RetypeDelta,
  SetRenameDelta,
} from './define.ts';
export { defineLens, LENS_FORMAT_VERSION, resolveAddDefault } from './define.ts';
export type { NormalizeOpsOptions, RegistryHooks } from './engine.ts';
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
} from './engine.ts';
export { lenses } from './lens-list.ts';
