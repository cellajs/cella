export { entityCache } from './app-entity-cache';
export { appCache } from './presets';

declare module 'hono' {
  interface ContextVariableMap {
    /** Enriched entity response the handler produced, cached by the appCache middleware. */
    entityCacheData: Record<string, unknown> | null;
  }
}
