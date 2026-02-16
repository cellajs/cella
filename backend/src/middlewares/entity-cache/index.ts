// Core cache instances (for direct access when needed)
export { entityCache } from './app-entity-cache';
// xCache middleware presets (use these in routes)
export { appCache, publicCache } from './presets';
export { publicEntityCache } from './public-entity-cache';

// Context type declarations for cache middleware
declare module 'hono' {
  interface ContextVariableMap {
    /** Entity data to cache - set by handler for app cache (set by handler) */
    entityCacheData: Record<string, unknown> | null;
    /** Cache token from request - app cache only (set by middleware) */
    entityCacheToken: string | null;
    /** Whether response was from cache */
    entityCacheHit: boolean;
  }
}
