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
    // routes wrong traffic; fail at synth/plan time instead.
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
    test: ['CMD', 'wget', '-qO-', `http://127.0.0.1:${port}/health`],
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
    runMigrate: cfg.runMigrate ?? false,
    replacementStrategy: cfg.replacementStrategy,
    drainSeconds: cfg.drainSeconds ?? 0,
    instanceType: cfg.instanceType,
  }
  if (cfg.primaryRollout) meta.primaryRollout = true
  if (cfg.drainPolicy) meta.drainPolicy = cfg.drainPolicy
  if (cfg.lbRoute) meta.lbRoute = cfg.lbRoute
  if (cfg.lbPathBegin) meta.lbPathBegin = cfg.lbPathBegin
  if (cfg.lbWebsockets) meta.lbWebsockets = true
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
 * `extraEnv` is machinery-injected env (e.g. a `runMigrate` service's synthetic
 * `RUN_MIGRATIONS_ON_BOOT=false`, since its one-shot `migrate` companion owns
 * migrations). Under the immutable-node model the app container binds the host
 * port directly (the per-VM ingress proxy is gone) and the LB health-checks the
 * app's own `/health`.
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
 * One-shot schema migrator derived from a service that opts into `runMigrate`.
 * Reuses the service image via `MODE=migrate`; applies migrations + ensures DB
 * roles, then exits. Run at the new generation's boot BEFORE the app starts
 * (expand-before-cutover), gated on exit 0. No port/healthcheck (not long-running).
 */
function migrateBlock(slug: string, cfg: AppServiceConfig): ComposeService {
  return {
    image: cfg.image,
    profiles: [slug],
    restart: 'no',
    env_file: ['.env', '.env.runtime'],
    environment: { ...STANDARD_ENV, MODE: 'migrate', ...(cfg.env ?? {}) },
  }
}

// Machinery: hand-authored, cella-owned. The one-shot migrate companion and
// the compose assembly. Not fork data; driven by the fork's service registry.

/**
 * Env injected into a `runMigrate` service's app block: its one-shot `migrate`
 * companion owns schema changes (run at new-generation boot before the app), so
 * the app container itself must NOT migrate on boot.
 */
const MIGRATE_GATED_ENV: Record<string, string> = { RUN_MIGRATIONS_ON_BOOT: 'false' }

/**
 * Assemble the full `ComposeFile` from the fork's service registry. Under the
 * immutable-node model each service is a single app block that binds the host
 * port directly (no per-VM ingress proxy); zero-downtime overlap happens at the
 * load balancer between VM generations, not inside the VM. A `runMigrate`
 * service additionally emits a one-shot `migrate` companion, run at the new
 * generation's boot before the app starts.
 */
export function assembleCompose(appServices: AppServices): ComposeFile {
  const services: Record<string, ComposeService> = {}
  for (const [slug, cfg] of Object.entries(appServices)) {
    services[slug] = appBlock(slug, cfg, { extraEnv: cfg.runMigrate ? MIGRATE_GATED_ENV : undefined })
    if (cfg.runMigrate) services.migrate = migrateBlock(slug, cfg)
  }
  publishCoHostedPorts(appServices, services)
  publishCoHostedEnv(appServices, services)
  return { services }
}

/**
 * Env keys NEVER folded from a co-hosted service into the host block: they
 * configure the container's process identity (which entrypoint mode to boot,
 * which port the main process binds), and under `singleVM` that identity is
 * the host's — the folded workers are booted in-process by the host's own
 * startup (`main.api.ts`) and read only their service-specific vars
 * (`CDC_HEALTH_PORT`, `YJS_PORT`, `API_WS_URL`, …).
 */
const PROCESS_IDENTITY_ENV = new Set(['MODE', 'PORT'])

/**
 * singleVM support, part 2 of 2 (ports above): fold every co-hosted service's
 * `env` into the host block. The workers run in-process on the host container,
 * so their wiring (`API_WS_URL`, `YJS_PORT`, …) must reach the HOST's
 * environment — their own blocks never start under the host's compose profile.
 * Placeholders (`${VAR}`) folded here are collected for the host VM by the
 * profile-driven scan in resources/compose-env.ts, which also unions the
 * co-hosted registry `bindings` that supply them. Same-value collisions are
 * fine (e.g. `BACKEND_URL` on host and worker); conflicting values fail synth
 * loudly rather than silently breaking one of the folded workers.
 */
function publishCoHostedEnv(appServices: AppServices, blocks: Record<string, ComposeService>): void {
  const hostSlug = Object.entries(appServices).find(([, cfg]) => cfg.primaryRollout)?.[0]
  if (!hostSlug) return
  const hostBlock = blocks[hostSlug]
  if (!hostBlock) return
  const merged: Record<string, string> = { ...(hostBlock.environment ?? {}) }
  for (const [slug, cfg] of Object.entries(appServices)) {
    if (!cfg.coHosted || !cfg.env) continue
    for (const [key, value] of Object.entries(cfg.env)) {
      if (PROCESS_IDENTITY_ENV.has(key)) continue
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
 * singleVM support: publish every co-hosted service's port on the host
 * (`primaryRollout`) block so that when `appConfig.singleVM` folds the workers
 * into the backend process, the load balancer can still reach each in-process
 * worker at the host VM on its own port. Published unconditionally (the Compose
 * file is shared across deploy modes); in the normal split-VM deploy the extra
 * host ports simply have nothing bound behind them and are never reachable from
 * the public internet (the VM security group drops all public inbound and the
 * LB only targets a service's own VM). No-op when no service opts in.
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
