/** Public barrel for the schema-evolution lens registry: what the backend and frontend read. @see README.md */

export type { LensEntityType } from './define.ts';
export type { RegistryHooks } from './engine.ts';
export {
  configureLensTelemetry,
  currentSchemaVersion,
  migrateCachedEntity,
  migrateQueuedMutation,
  normalizeOps,
  widenedOpsKeyMap,
} from './engine.ts';
