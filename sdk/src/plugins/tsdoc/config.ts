import { definePluginConfig } from '@hey-api/openapi-ts';
import { handler } from './plugin';
import type { TsdocPlugin } from './types';

/**
 * Default plugin configuration for `tsdoc`.
 */
const defaultConfig: TsdocPlugin['Config'] = {
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
  name: 'tsdoc',

  /**
   * Name of the output file (relative to output path). Currently unused: the
   * handler enriches operation descriptions in place and writes no file.
   */
  config: {
    output: 'tsdoc',
  },
};

export const defineConfig = definePluginConfig(defaultConfig);
