import _default from './default-config';
import development from './development-config';
import production from './production-config';
import staging from './staging-config';
import test from './test-config';
import tunnel from './tunnel-config';
import { mergeDeep } from './src/builder/utils';

type Config = typeof _default;
const configModes = { development, tunnel, staging, production, test } satisfies Record<Config['mode'], unknown>;

export type ConfigMode = Config['mode'];

const mode = (process.env.NODE_ENV || 'development') as Config['mode'];

/**
 * Merged app configuration which combines default config with environment-specific overrides.
 * Type is preserved from _default to maintain literal types for Drizzle v1 strict enum typing.
 */
export const appConfig: Config = mergeDeep(_default, configModes[mode]);
