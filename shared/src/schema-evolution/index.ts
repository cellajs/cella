/**
 * Public barrel for the schema-evolution lens registry.
 *
 * @see README.md
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
  LensEntityType,
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
