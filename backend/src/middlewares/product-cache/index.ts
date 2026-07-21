export { productCache } from './presets';

declare module 'hono' {
  interface ContextVariableMap {
    /** Enriched entity response the handler produced, cached by the productCache middleware. */
    productCacheData: Record<string, unknown> | null;
  }
}
