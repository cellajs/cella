import type { DefinePlugin } from '@hey-api/openapi-ts';

/**
 * Configuration options for the `tsdoc-plugin` plugin.
 */
export type Config = {
  /**
   * Plugin name (must be unique across plugins).
   */
  name: 'tsdoc-plugin';

  /**
   * Output file name, without `.gen.ts` extension.
   */
  output?: string;
};

export type TsdocPlugin = DefinePlugin<Config>;
