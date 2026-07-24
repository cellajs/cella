/** One service's endpoint entry in the app config (`services.<slug>`). */
export interface EngineServiceEndpoint {
  enabled?: boolean
  publicUrl?: string
}

/**
 * The engine's input contract: everything the deploy engine (resources, tasks,
 * CLI) reads about the app it deploys. A host injects a value satisfying this
 * interface; cella's merged appConfig satisfies it structurally. Keep this the
 * complete list: a new field read anywhere in the engine belongs here first.
 */
export interface EngineConfig {
  /** URL-safe resource prefix for every Scaleway resource and bucket. */
  slug: string
  /** Config mode; deploys accept 'production' or 'staging'. */
  mode: string
  /** Registered DNS zone the app deploys under ('localhost' disables deploys). */
  domain: string
  frontendUrl: string
  backendUrl: string
  /** Cost escape hatch: the backend co-hosts every enabled worker in-process. */
  singleVM: boolean
  s3: {
    region: string
    host: string
    publicBucket: string
    privateBucket: string
    publicCDNUrl: string
    privateCDNUrl: string
  }
  /** Service endpoint config keyed by slug (enabled flags + public URLs). */
  services: Record<string, EngineServiceEndpoint>
}

let injected: EngineConfig | undefined

/**
 * Inject the config the engine deploys. Must run BEFORE any engine module that
 * reads config at evaluation is imported; entrypoints call
 * {@link loadEngineConfig} first and dynamic-import the rest.
 */
export function setEngineConfig(config: EngineConfig): void {
  injected = config
}

/** The active engine config. Throws when no config has been loaded yet. */
export function engineConfig(): EngineConfig {
  if (!injected) {
    throw new Error('engine-config: no config loaded — await loadEngineConfig() (or call setEngineConfig) before importing engine modules.')
  }
  return injected
}

/** Structural check for configs arriving from an INFRA_CONFIG_MODULE import. */
function isEngineConfig(value: unknown): value is EngineConfig {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  const strings = ['slug', 'mode', 'domain', 'frontendUrl', 'backendUrl'] as const
  if (!strings.every((key) => typeof record[key] === 'string')) return false
  if (typeof record.singleVM !== 'boolean') return false
  if (typeof record.s3 !== 'object' || record.s3 === null) return false
  if (typeof record.services !== 'object' || record.services === null) return false
  return true
}

/**
 * Resolve and inject the engine config, idempotently: the module named by
 * INFRA_CONFIG_MODULE (its `engineConfig` or default export; the package-mode
 * path), or the workspace's shared appConfig (cella in-repo mode). The shared
 * import stays dynamic so this module can be imported before APP_MODE is set.
 */
export async function loadEngineConfig(): Promise<EngineConfig> {
  if (injected) return injected
  const configModule = process.env.INFRA_CONFIG_MODULE
  if (configModule) {
    const { pathToFileURL } = await import('node:url')
    const mod: Record<string, unknown> = await import(pathToFileURL(configModule).href)
    const candidate = mod.engineConfig ?? mod.default
    if (!isEngineConfig(candidate)) {
      throw new Error(`engine-config: module '${configModule}' does not export an EngineConfig ('engineConfig' or default export).`)
    }
    setEngineConfig(candidate)
    return candidate
  }
  const { appConfig } = await import('shared')
  setEngineConfig(appConfig)
  return appConfig
}
