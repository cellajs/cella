/**
 * Entry point for the `tsdoc-plugin` plugin.
 * Re-exports the configuration factory and types for use in your OpenAPI appConfig.
 */
export { defaultConfig, defineConfig } from './config';
export type { TsdocPlugin } from './types';
