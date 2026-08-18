import { definePluginConfig } from '@hey-api/openapi-ts';
import { handler } from './plugin';
import type { TsdocPlugin } from './types';

const defaultConfig: TsdocPlugin['Config'] = {
  /** Plugins that must run before this one. */
  dependencies: ['@hey-api/typescript'],

  handler,

  name: 'tsdoc',

  /** Output file name, unused: the handler edits operation descriptions in place and writes no file. */
  config: {
    output: 'tsdoc',
  },
};

export const defineConfig = definePluginConfig(defaultConfig);
