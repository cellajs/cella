// Core cache instances (for direct access when needed)
export { entityCache } from './app-entity-cache';
export { batchCache } from './batch-resolve';
// xCache middleware presets (use these in routes)
export { appCache } from './presets';

// Context type declarations for cache middleware
declare module 'hono' {
  interface ContextVariableMap {
    /** Entity data to cache - set by handler for app cache (set by handler) */
    entityCacheData: Record<string, unknown> | null;
    /** Resolved entity key from cache token - app cache only (set by middleware) */
    entityCacheToken: string | null;
    /** Whether response was from cache */
    entityCacheHit: boolean;
  }
}
