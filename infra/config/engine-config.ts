import { defineEngineConfig } from '@cellajs/cli/infra';
import { appConfig } from 'shared';
import { config as defaults } from 'shared/config/config.default';

/**
 * The config the engine deploys: the workspace's appConfig for the mode `APP_MODE` names, read once, when this module
 * first loads. The engine loads it after its entry point set `APP_MODE`. The app's slug is production's: the default
 * config's, which production keeps and other modes override.
 */
export const engineConfig = defineEngineConfig({ ...appConfig, appSlug: defaults.slug });
