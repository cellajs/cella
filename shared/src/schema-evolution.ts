// The `shared/schema-evolution` entry (the `./*` -> `./src/*.ts` export map): what the backend and frontend read.
export type { LensEntityType } from './schema-evolution/define.ts';
export type { RegistryHooks } from './schema-evolution/engine.ts';
export {
  configureLensTelemetry,
  currentSchemaVersion,
  migrateCachedEntity,
  migrateQueuedMutation,
  normalizeOps,
  widenedOpsKeyMap,
} from './schema-evolution/engine.ts';
