/**
 * Schema-evolution lens registry — public barrel.
 *
 * The ordered, append-only lens list lives in `lens-list.ts` (the designated
 * append point). `currentSchemaVersion` is derived as the list length (engine.ts).
 *
 * See info/SCHEMA_EVOLUTION.md.
 */
export { lenses } from './lens-list';
export { schemaEvolutionPolicy } from './config';
export { defineLens } from './define';
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
export type { RegistryHooks } from './engine';
