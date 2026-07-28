import { healthContract } from '../config/health.config'
import type { AppServiceConfig, AppServices, ServiceMeta, ComposeFile, ComposeService, HealthCheck } from './types'

/** Helper for `services.config.ts`: typed identity that preserves literal keys. */
export function defineServices<const T extends AppServices>(services: T): T {
  const seenPrefixes = new Map<string, string>()
  for (const [slug, cfg] of Object.entries(services)) {
    const prefix = cfg.lbPathBegin
    if (prefix === undefined) {
      // A path-routed service is reachable ONLY through its path route.
      if (cfg.lbRoute === 'path') throw new Error(`services config: '${slug}' has lbRoute 'path' but no lbPathBegin — nothing would route to it.`)
      continue
    }
    // The LB matches the raw path-begin string, so a malformed prefix silently
    // routes wrong traffic, so validation fails during synth/plan.
    if (!cfg.lbRoute) throw new Error(`services config: '${slug}' declares lbPathBegin without lbRoute — an internal-only service has no LB backend to route to.`)
    if (!/^\/[a-z0-9-]+$/.test(prefix)) {
      throw new Error(`services config: '${slug}' lbPathBegin '${prefix}' must be a single lowercase path segment starting with '/' and no trailing slash (e.g. '/api').`)
    }
    const owner = seenPrefixes.get(prefix)
    if (owner) throw new Error(`services config: lbPathBegin '${prefix}' declared by both '${owner}' and '${slug}' — path prefixes must be unique.`)
    seenPrefixes.set(prefix, slug)
  }
  return services
}

/** Standard environment injected into every app service unless opted out. */
const STANDARD_ENV = {
  NODE_ENV: 'production',
  APP_MODE: '${APP_MODE:-production}',
  TZ: 'UTC',
} as const

/** Uniform identity healthcheck injected into every app service. */
function healthcheck(port: number, startPeriod: string): HealthCheck {
  return {
    test: ['CMD', 'wget', '-qO-', `http://127.0.0.1:${port}${healthContract.path}`],
    interval: '30s',
    timeout: '5s',
    retries: 3,
    start_period: startPeriod,
  }
}

/** Build the `x-service` deploy metadata from an app service entry (omit absent optionals). */
function metaFrom(slug: string, cfg: AppServiceConfig): ServiceMeta {
  const meta: ServiceMeta = {
    slug,
    healthPort: cfg.port,
    healthTimeoutSeconds: cfg.healthTimeoutSeconds,
    healthExpectStatus: cfg.healthExpectStatus ?? 200,
    runMigrate: cfg.release !== undefined,
    replacementStrategy: cfg.replacementStrategy,
    drainSeconds: cfg.drainSeconds ?? 0,
    instanceType: cfg.instanceType,
  }
  if (cfg.primaryRollout) meta.primaryRollout = true
  if (cfg.drainPolicy) meta.drainPolicy = cfg.drainPolicy
  if (cfg.lbRoute) meta.lbRoute = cfg.lbRoute
  if (cfg.lbPathBegin) meta.lbPathBegin = cfg.lbPathBegin
  if (cfg.lbWebsockets) meta.lbWebsockets = true
  if (cfg.internalRoute) meta.internalRoute = true
  if (cfg.reusesImageOf) meta.reusesImageOf = cfg.reusesImageOf
  if (cfg.dockerfile) meta.dockerfile = cfg.dockerfile
  if (cfg.target) meta.target = cfg.target
  if (cfg.coHosted) meta.coHosted = true
  if (cfg.bindings) meta.bindings = cfg.bindings
  return meta
}

/**
 * Expand one fork app-service entry into a full Compose service block.
 *
 * `extraEnv` is the service's release-step `appEnv` (the env applied to the app
 * block whenever a release companion exists, e.g. to keep the app from repeating
 * the release work on its own boot). Under the immutable-node model the app
 * container binds the host port directly (the per-VM ingress proxy is gone) and
 * the LB health-checks the app's own health endpoint.
 */
function appBlock(
  slug: string,
  cfg: AppServiceConfig,
  opts: { extraEnv?: Record<string, string> } = {},
): ComposeService {
  const environment = {
    ...(cfg.includeStandardEnv === false ? {} : STANDARD_ENV),
    ...(cfg.env ?? {}),
    ...(opts.extraEnv ?? {}),
  }
  const block: ComposeService = {
    image: cfg.image,
    profiles: [slug],
    restart: 'unless-stopped',
    // Publish the host port directly: the LB targets it and health-checks the
    // app's real `/health` (no ingress hop in the immutable-node model).
    ports: [`${cfg.port}:${cfg.port}`],
    stop_grace_period: cfg.stopGracePeriod ?? '30s',
    ...(cfg.includeEnvFile === false ? {} : { env_file: ['.env', '.env.runtime'] }),
    environment,
    healthcheck: healthcheck(cfg.port, cfg.startPeriod),
  }
  block['x-service'] = metaFrom(slug, cfg)
  return block
}

/**
 * One-shot release companion derived from a service that declares a `release`
 * step. Reuses the service image with the fork's release command/env, then
 * exits. Run at the new generation's boot BEFORE the app starts
 * (expand-before-cutover), gated on exit 0. No port/healthcheck (not long-running).
 */
function releaseBlock(slug: string, cfg: AppServiceConfig): ComposeService {
  const release = cfg.release
  return {
    image: cfg.image,
    profiles: [slug],
    restart: 'no',
    ...(release?.command ? { command: release.command } : {}),
    env_file: ['.env', '.env.runtime'],
    environment: { ...STANDARD_ENV, ...(release?.env ?? {}), ...(cfg.env ?? {}) },
  }
}

// Machinery: the one-shot release companion and the compose assembly. Not fork
// data; driven by the fork's service registry.

/**
 * Assemble the full `ComposeFile` from the fork's service registry. Under the
 * immutable-node model each service is a single app block that binds the host
 * port directly (no per-VM ingress proxy); zero-downtime overlap happens at the
 * load balancer between VM generations, not inside the VM. A service that
 * declares a `release` step additionally emits a one-shot companion, run at the
 * new generation's boot before the app starts.
 *
 * `processIdentityEnv` names the env keys that select a container's process
 * identity (which worker/mode, which port); they are never folded from a
 * co-hosted worker into the singleVM host. Fork-owned so the engine names no
 * app-specific env key.
 */
export function assembleCompose(appServices: AppServices, options: { processIdentityEnv?: readonly string[] } = {}): ComposeFile {
  const processIdentityEnv = new Set(options.processIdentityEnv ?? [])
  const services: Record<string, ComposeService> = {}
  for (const [slug, cfg] of Object.entries(appServices)) {
    services[slug] = appBlock(slug, cfg, { extraEnv: cfg.release?.appEnv })
    if (cfg.release) services.migrate = releaseBlock(slug, cfg)
  }
  publishCoHostedPorts(appServices, services)
  publishCoHostedEnv(appServices, services, processIdentityEnv)
  return { services }
}

/**
 * Folds co-hosted service environments into the single-VM host block.
 * The host profile supplies their placeholders and bindings because worker blocks do not start.
 * Equal collisions are accepted; conflicting values fail synthesis. Process-identity
 * env keys are skipped: under `singleVM` the folded workers boot in-process under
 * the host's own identity and read only their service-specific vars.
 */
function publishCoHostedEnv(appServices: AppServices, blocks: Record<string, ComposeService>, processIdentityEnv: ReadonlySet<string>): void {
  const hostSlug = Object.entries(appServices).find(([, cfg]) => cfg.primaryRollout)?.[0]
  if (!hostSlug) return
  const hostBlock = blocks[hostSlug]
  if (!hostBlock) return
  const merged: Record<string, string> = { ...(hostBlock.environment ?? {}) }
  for (const [slug, cfg] of Object.entries(appServices)) {
    if (!cfg.coHosted || !cfg.env) continue
    for (const [key, value] of Object.entries(cfg.env)) {
      if (processIdentityEnv.has(key)) continue
      const existing = merged[key]
      if (existing !== undefined && existing !== value) {
        throw new Error(
          `compose synth: co-hosted service '${slug}' env '${key}=${value}' conflicts with '${existing}' already on host '${hostSlug}' — rename the worker's variable in services.config.ts (folded env must not overload host keys).`,
        )
      }
      merged[key] = value
    }
  }
  hostBlock.environment = merged
}

/**
 * Publishes co-hosted worker ports on the single-VM host for load-balancer access.
 * Shared Compose output includes them in split mode too, where nothing binds them and network
 * policy keeps them unreachable. Does nothing when no service opts in.
 */
function publishCoHostedPorts(appServices: AppServices, blocks: Record<string, ComposeService>): void {
  const hostSlug = Object.entries(appServices).find(([, cfg]) => cfg.primaryRollout)?.[0]
  if (!hostSlug) return
  const hostBlock = blocks[hostSlug]
  if (!hostBlock) return
  const coHostedPorts = Object.values(appServices)
    .filter((cfg) => cfg.coHosted)
    .map((cfg) => `${cfg.port}:${cfg.port}`)
  if (coHostedPorts.length === 0) return
  const existing = new Set(hostBlock.ports ?? [])
  hostBlock.ports = [...(hostBlock.ports ?? []), ...coHostedPorts.filter((p) => !existing.has(p))]
}
