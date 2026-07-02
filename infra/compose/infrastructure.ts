/**
 * Cella-owned Compose machinery. Forks should NOT edit this file — fork-facing
 * service *data* lives in `services.config.ts`; this module turns that data into
 * a full Compose model.
 *
 * What lives here:
 *   - the per-VM `ingress` reverse proxy (zero-downtime host-port owner);
 *   - the blue-green expansion: how a `blue-green` service (the backend) becomes
 *     two named slots + a one-shot `migrate` companion. The fork still owns the
 *     backend's image/sizing/env as a normal `services.config.ts` entry;
 *   - the uniform healthcheck/env scaffolding injected into every app service;
 *   - `assembleCompose()`, which expands the service registry into the
 *     `ComposeFile` that `synth.ts` emits.
 *
 * See infra/README.md (Zero-downtime deploys).
 */
import type { AppServiceConfig, AppServices, ServiceMeta, ComposeFile, ComposeService, HealthCheck } from './types'

/** Helper for `services.config.ts` — typed identity that preserves literal keys. */
export function defineServices<const T extends AppServices>(services: T): T {
  return services
}

/** Standard environment injected into every app service unless opted out. */
const STANDARD_ENV = {
  NODE_ENV: 'production',
  APP_MODE: '${APP_MODE:-production}',
  TZ: 'UTC',
} as const

/** Uniform identity healthcheck injected into every app service. */
export function healthcheck(port: number, startPeriod: string): HealthCheck {
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
  if (cfg.lbWebsockets) meta.lbWebsockets = true
  if (cfg.reusesImageOf) meta.reusesImageOf = cfg.reusesImageOf
  if (cfg.dockerfile) meta.dockerfile = cfg.dockerfile
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
    // Publish the host port directly — the LB targets it and health-checks the
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

// ---------------------------------------------------------------------------
// Machinery — hand-authored, cella-owned. The one-shot migrate companion and
// the compose assembly. Not fork data; driven by the fork's service registry.
// ---------------------------------------------------------------------------

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
  return { services }
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
