import type { DefinePlugin } from '@hey-api/openapi-ts';

export type Config = {
  /** Unique across plugins. */
  name: 'tsdoc';
};

export type TsdocPlugin = DefinePlugin<Config>;
