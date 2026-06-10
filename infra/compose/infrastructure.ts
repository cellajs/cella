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
 * See infra/INFRA_ARCHITECTURE.md (Zero-downtime deploys).
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
    rolloverStrategy: cfg.rolloverStrategy,
    drainSeconds: cfg.drainSeconds ?? 0,
  }
  if (cfg.lbRoute) meta.lbRoute = cfg.lbRoute
  if (cfg.reusesImageOf) meta.reusesImageOf = cfg.reusesImageOf
  if (cfg.featureFlag) meta.featureFlag = cfg.featureFlag
  if (cfg.instanceType) meta.instanceType = cfg.instanceType
  return meta
}

/**
 * Expand one fork app-service entry into a full Compose service block.
 *
 * `extraEnv` is machinery-injected env (e.g. the blue-green slots' synthetic
 * `RUN_MIGRATIONS_ON_BOOT=false`, gated by the `migrate` companion); `withMeta`
 * is false for the idle blue-green slot, a pure expansion that carries no
 * logical-service `x-service`.
 */
function appBlock(
  slug: string,
  cfg: AppServiceConfig,
  opts: { extraEnv?: Record<string, string>; withMeta?: boolean } = {},
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
    expose: [String(cfg.port)],
    stop_grace_period: cfg.stopGracePeriod ?? '30s',
    ...(cfg.includeEnvFile === false ? {} : { env_file: ['.env', '.env.runtime'] }),
    environment,
    healthcheck: healthcheck(cfg.port, cfg.startPeriod),
  }
  if (opts.withMeta !== false) block['x-service'] = metaFrom(slug, cfg)
  return block
}

/**
 * One-shot schema migrator derived from a `blue-green` service that opts into
 * `runMigrate`. Reuses the service image via `MODE=migrate`; applies migrations
 * + ensures DB roles, then exits. Run by the reconciler BEFORE the idle slot
 * rolls and gated on exit 0, so the slot health window is pure boot time. No
 * port/healthcheck (not long-running).
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
// Machinery — hand-authored, cella-owned. The ingress proxy and the blue-green
// expansion. Not fork data; driven by the fork's service registry.
// ---------------------------------------------------------------------------

/**
 * Per-VM ingress reverse proxy. Started once at boot and left running; the
 * reconciler never recreates it. Owns the host port and forwards to the active
 * app container over the compose network, so an app rollover never drops the LB
 * backend. No `x-service` → not a logical service. Runs on every service VM, so
 * its profiles are the full set of fork service slugs.
 */
function ingressBlock(slugs: readonly string[]): ComposeService {
  return {
    image: 'caddy:2-alpine',
    profiles: [...slugs],
    restart: 'unless-stopped',
    ports: ['${INGRESS_PORT}:${INGRESS_PORT}'],
    environment: {
      INGRESS_PORT: '${INGRESS_PORT}',
      UPSTREAM_HOST: '${UPSTREAM_HOST}',
      UPSTREAM_PORT: '${UPSTREAM_PORT}',
    },
    volumes: ['./ingress.Caddyfile:/etc/caddy/Caddyfile:ro', 'ingress_data:/data', 'ingress_config:/config'],
    healthcheck: {
      test: ['CMD', 'wget', '-qO-', 'http://127.0.0.1:${INGRESS_PORT}/__ingress/health'],
      interval: '30s',
      timeout: '5s',
      retries: 3,
      start_period: '5s',
    },
  }
}

/** Volumes owned by the ingress proxy. */
const INFRA_VOLUMES = { ingress_data: null, ingress_config: null } as const

/**
 * Env injected into both blue-green slots when the service runs migrations: the
 * one-shot `migrate` companion handles schema changes before the slot rolls, so
 * the slots themselves must NOT migrate on boot.
 */
const MIGRATE_GATED_ENV: Record<string, string> = { RUN_MIGRATIONS_ON_BOOT: 'false' }

/**
 * Assemble the full `ComposeFile` from the fork's service registry. The ingress
 * proxy is emitted first (it runs on every service VM), then each service in
 * declaration order.
 *
 * A `blue-green` service (the backend) expands into the cella zero-downtime
 * mechanism: two named slots — `<slug>-blue` (active, carries `x-service`) and
 * `<slug>-green` (idle, a pure expansion) — that only ONE serves at a time while
 * the reconciler flips the ingress upstream between them; plus, if it opts into
 * `runMigrate`, a one-shot `migrate` companion run before the roll. An
 * `in-place` service emits a single block.
 */
export function assembleCompose(appServices: AppServices): ComposeFile {
  const services: Record<string, ComposeService> = {
    ingress: ingressBlock(Object.keys(appServices)),
  }
  for (const [slug, cfg] of Object.entries(appServices)) {
    if (cfg.rolloverStrategy === 'blue-green') {
      const extraEnv = cfg.runMigrate ? MIGRATE_GATED_ENV : undefined
      services[`${slug}-blue`] = appBlock(slug, cfg, { extraEnv, withMeta: true })
      services[`${slug}-green`] = appBlock(slug, cfg, { extraEnv, withMeta: false })
      if (cfg.runMigrate) services.migrate = migrateBlock(slug, cfg)
    } else {
      services[slug] = appBlock(slug, cfg)
    }
  }
  return { services, volumes: INFRA_VOLUMES }
}
