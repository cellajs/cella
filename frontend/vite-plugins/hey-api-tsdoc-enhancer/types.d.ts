import type { DefinePlugin } from '@hey-api/openapi-ts';

/**
 * Configuration options for the `tsdoc-enhancer` plugin.
 */
export type Config = {
  /**
   * Plugin name (must be unique across plugins).
   */
  name: 'tsdoc-enhancer';

  /**
   * Output file name, without `.gen.ts` extension.
   */
  output?: string;

  /**
   * Custom flag or option for future plugin logic.
   */
  myOption?: boolean;
};

export type TsdocEnhancer = DefinePlugin<Config>;
