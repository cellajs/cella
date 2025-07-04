/**
 * Entry point for the `tsdoc-enhancer` plugin.
 *
 * Re-exports the configuration factory and types for use in your OpenAPI config.
 *
 * @example
 * ```ts
 * import { defineConfig as tsdocEnhancer } from './plugins/hey-api-tsdoc-enhancer';
 *
 * export default {
 *   plugins: [tsdocEnhancer({ myOption: true })],
 * };
 * ```
 */
export { defaultConfig, defineConfig } from './config';
export type { TsdocEnhancer } from './types';
