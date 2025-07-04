import { definePluginConfig } from '@hey-api/openapi-ts';
import { handler } from './plugin';
import type { TsdocEnhancer } from './types';

/**
 * Default plugin configuration for `tsdoc-enhancer`.
 */
export const defaultConfig: TsdocEnhancer['Config'] = {
  /**
   * Static config used when no user config is provided.
   */
  config: {
    /**
     * Example user-configurable option.
     * Currently unused, but can be extended.
     */
    myOption: false,
  },

  /**
   * Optional list of plugin dependencies that must run before this one.
   */
  dependencies: ['@hey-api/typescript'],

  /**
   * Handler function that executes the plugin logic.
   */
  handler,

  /**
   * Unique plugin name. Must not conflict with others.
   */
  name: 'tsdoc-enhancer',

  /**
   * Name of the output file (relative to output path).
   * Will generate `tsdoc-enhancer.gen.ts` (now it doesnt generate a file, but maybe it will in the future).
   */
  output: 'tsdoc-enhancer',
};

export const defineConfig = definePluginConfig(defaultConfig);
