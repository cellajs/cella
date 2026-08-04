/**
 * Public barrel for the schema-evolution lens registry.
 *
 * @see README.md
 */

export { schemaEvolutionPolicy, type UnknownFieldHandling } from './config';
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
} from './define';
export { defineLens, LENS_FORMAT_VERSION, resolveAddDefault } from './define';
export type { NormalizeOpsOptions, RegistryHooks } from './engine';
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
export { lenses } from './lens-list';
