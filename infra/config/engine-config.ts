import { appConfig as cellaAppConfig } from '../../shared'

/**
 * The engine's input contract: everything the deploy engine (resources, tasks,
 * pulumi-context) reads about the app it deploys. Today this is cella's merged
 * appConfig shape; the npm-package extraction narrows it to an explicit
 * structural interface without touching consumers, because every consumer
 * already goes through `engineConfig()` below.
 */
export type EngineConfig = typeof cellaAppConfig

let injected: EngineConfig | undefined

/**
 * Inject the config the engine deploys. Must run BEFORE any engine module is
 * imported (they read config at module evaluation): dynamic-import the program
 * after calling this. The Automation API driver and future embedders use this;
 * without injection the engine falls back to the workspace's shared appConfig,
 * which resolves from APP_MODE exactly as before.
 */
export function setEngineConfig(config: EngineConfig): void {
  injected = config
}

/** The active engine config: the injected one, or the workspace appConfig. */
export function engineConfig(): EngineConfig {
  return injected ?? cellaAppConfig
}
