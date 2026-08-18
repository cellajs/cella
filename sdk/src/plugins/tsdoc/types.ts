import type { DefinePlugin } from '@hey-api/openapi-ts';

export type Config = {
  /** Unique across plugins. */
  name: 'tsdoc';

  /** Output file name, without the `.gen.ts` extension. */
  output?: string;
};

export type TsdocPlugin = DefinePlugin<Config>;
