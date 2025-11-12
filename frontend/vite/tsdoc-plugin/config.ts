import { definePluginConfig } from '@hey-api/openapi-ts';
import { handler } from './plugin';
import type { TsdocPlugin } from './types';

/**
 * Default plugin configuration for `tsdoc-plugin`.
 */
export const defaultConfig: TsdocPlugin['Config'] = {
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
  name: 'tsdoc-plugin',

  /**
   * Name of the output file (relative to output path).
   * Will generate `tsdoc-plugin.gen.ts` (now it doesnt generate a file, but maybe it will in the future).
   */
  config: {
    output: 'tsdoc-plugin',
  },
};

export const defineConfig = definePluginConfig(defaultConfig);
