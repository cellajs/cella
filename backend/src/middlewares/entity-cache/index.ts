export { entityCache } from './app-entity-cache';
export { batchCache } from './batch-resolve';
export { appCache } from './presets';

declare module 'hono' {
  interface ContextVariableMap {
    /** Entity data to cache, set by the handler for app cache. */
    entityCacheData: Record<string, unknown> | null;
    /** Resolved entity key from cache token, app cache only. */
    entityCacheToken: string | null;
    /** Whether response was from cache */
    entityCacheHit: boolean;
  }
}
