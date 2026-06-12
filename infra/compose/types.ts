/**
 * A minimal, typed subset of the Docker Compose Spec — just enough to model the
 * deploy Compose file as TypeScript and synthesize `infra/compose.gen.yml` from it.
 *
 * The hand-authored interfaces here give `services.config.ts` compile-time
 * checking; `synth.ts` emits the declarative `compose.gen.yml` that Docker
 * consumes.
 *
 * `x-service` is the Compose-Spec extension field (the `x-` prefix is the sole key
 * Compose silently ignores — see compose-spec/11-extension.md). It carries
 * deploy-plane metadata Compose has no native slot for (rollover strategy, LB
 * routing, per-mode VM size). Its presence on a service block also marks that
 * block as a *logical service*, so adding/removing a service is a single edit here.
 */

import type { Environment } from '../lib/bootstrap-stack-state'

export type RolloverStrategy = 'in-place' | 'blue-green'

/**
 * How the load balancer exposes a service publicly:
 *  - 'default' — the LB's fallback backend (the API).
 *  - 'host'    — host-header routed (own DNS record + cert + route).
 * Absent = internal-only (no public LB backend; e.g. cdc).
 */
export type LbRoute = 'default' | 'host'

/** A service's VM size: one type for all modes, or a per-mode map. */
export type ServiceInstanceType = string | Partial<Record<Environment, string>>

/**
 * Deploy-plane metadata for one *logical* service, carried in the Compose file
 * as `x-service`. The single source of truth for the deploy knobs; `lib/services.ts`
 * derives its `ServiceDefinition` registry from these blocks.
 *
 * Removing a block removes the service from the registry entirely (no VM, LB
 * backend, DNS, cert, deploy tag, or reconciler env). `featureFlag` is the
 * orthogonal, per-deploy gate: the block stays in the registry but the service
 * only deploys when the app enables that feature (see `enabledServices`).
 */
export interface ServiceMeta {
  /**
   * Canonical service identifier — the compose profile, deploy-tag key, and VM
   * key. May differ from the YAML block name for slot-based services (the
   * `backend-blue` block carries `slug: 'backend'`).
   */
  slug: string
  /** Host/exposed port the reconciler probes for the identity health check. */
  healthPort: number
  /** Seconds the reconciler waits for the new container to pass /health. */
  healthTimeoutSeconds: number
  /** Run the one-shot `migrate` service before rolling this service. */
  runMigrate: boolean
  /** How the reconciler rolls this service. */
  rolloverStrategy: RolloverStrategy
  /** Blue-green drain window (seconds) after the ingress flips; 0 for in-place. */
  drainSeconds: number
  /** Public LB exposure; absent = internal-only. */
  lbRoute?: LbRoute
  /** Long-lived LB timeouts (1h server/tunnel) for WebSocket services. */
  lbWebsockets?: boolean
  /** Service whose image this one reuses (ai reuses backend); no own image built. */
  reusesImageOf?: string
  /**
   * `appConfig.has.*` flag that gates this service per deploy. Absent = always
   * deployed; set = only deployed when that feature is on (yjs, ai).
   */
  featureFlag?: string
  /** Per-service VM size; a fork resizes its fleet by editing this. Required — every service declares its own box. */
  instanceType: ServiceInstanceType
  /**
   * Deploy-time env bindings: env var → value template resolved by the compute
   * module. Templates reference other services by slug with the `@{…}` sigil
   * (distinct from compose's `${…}`): `@{<slug>.url}` (public URL),
   * `@{<slug>.privateIp}` / `@{<slug>.port}` (private-network address), or
   * `@{self.…}` for the service's own values. E.g. cdc's
   * `API_WS_URL: 'ws://@{backend.privateIp}:@{backend.port}/internal/cdc'`.
   */
  bindings?: Readonly<Record<string, string>>
}

export interface HealthCheck {
  test: readonly string[]
  interval: string
  timeout: string
  retries: number
  start_period: string
}

export interface ComposeService {
  image: string
  profiles: readonly string[]
  restart: string
  ports?: readonly string[]
  expose?: readonly string[]
  stop_grace_period?: string
  env_file?: readonly string[]
  environment?: Readonly<Record<string, string>>
  volumes?: readonly string[]
  healthcheck?: HealthCheck
  /** Deploy-plane metadata; presence marks a logical service. */
  'x-service'?: ServiceMeta
}

export interface ComposeFile {
  services: Readonly<Record<string, ComposeService>>
  volumes?: Readonly<Record<string, null>>
}

/**
 * One app service, authored in the fork-owned `services.config.ts`.
 *
 * This is the *data* tier of the synthesis split: a fork declares its services
 * here as compact, declarative entries; cella's `infrastructure.ts` owns the
 * *machinery* (the ingress proxy, the blue-green / one-shot-migrate mechanism,
 * the healthcheck shape, the shared env) and expands each entry into the full
 * Compose block at synth time. Uniform boilerplate (the healthcheck block, the
 * `NODE_ENV`/`APP_MODE`/`TZ` env, the `.env` files) is injected by cella, so it
 * never has to be repeated here and a fork picks up cella's changes to it on
 * sync without a merge conflict.
 *
 * To add a service: add an entry. To remove one: delete the entry — there is no
 * separate feature flag, presence here is what puts the service in the fleet.
 */
export interface AppServiceConfig {
  /** Container image ref, e.g. `'${REGISTRY}/yjs:${YJS_TAG:-latest}'`. */
  image: string
  /**
   * The single port this service listens on. Drives both the Compose `expose:`
   * and the reconciler's identity healthcheck (`http://127.0.0.1:<port>/health`).
   */
  port: number
  /**
   * Seconds the reconciler waits for a new container to answer `/health` with
   * the desired version before rolling back. Heavy images (the backend, and ai
   * which reuses it) need a larger budget than the lightweight workers.
   */
  healthTimeoutSeconds: number
  /**
   * Compose healthcheck `start_period` — the grace window before failing probes
   * count. Roughly the container's cold-boot time.
   */
  startPeriod: string
  /**
   * How the reconciler rolls this service. App-registry services use `'in-place'`
   * (recreate the single container behind the ingress). `'blue-green'` is the
   * backend-only zero-downtime mechanism owned by cella's `infrastructure.ts`.
   */
  rolloverStrategy: RolloverStrategy
  /** Run the one-shot `migrate` service before rolling. Backend-only today. */
  runMigrate?: boolean
  /** Blue-green drain window (seconds) after the ingress flips; defaults to 0. */
  drainSeconds?: number
  /**
   * How the load balancer exposes this service publicly. `'default'` = the LB's
   * fallback backend (the API); `'host'` = its own DNS record + cert + route.
   * Omit for internal-only (no public LB backend — e.g. cdc).
   */
  lbRoute?: LbRoute
  /**
   * Keep LB connections long-lived (1h server/tunnel timeouts) for services
   * speaking WebSockets through the LB (yjs). Only meaningful with `lbRoute`.
   */
  lbWebsockets?: boolean
  /**
   * Service whose image this one reuses, so CI builds no separate image for it
   * (ai reuses the backend image at the same SHA).
   */
  reusesImageOf?: string
  /**
   * `appConfig.has.*` flag that gates this service per deploy. Omit to always
   * deploy; set to deploy only when the app enables that feature. The block
   * stays in the registry either way — this is the runtime gate, not removal.
   */
  featureFlag?: string
  /**
   * Per-service VM size — a fork resizes its fleet by editing this. Required:
   * every service declares its own box (there is no fleet-wide fallback). A
   * single type for all modes, or a per-mode map.
   */
  instanceType: ServiceInstanceType
  /**
   * Service-specific environment variables (e.g. cdc's `API_WS_URL`, ai's
   * `MODE: ai-worker`). Merged AFTER the standard env so it can override it.
   * The uniform `NODE_ENV`/`APP_MODE`/`TZ` are injected by cella — don't repeat
   * them here.
   */
  env?: Readonly<Record<string, string>>
  /**
   * Deploy-time values for this service's `${VAR}` env placeholders, expressed
   * as templates over other services: `@{<slug>.url}`, `@{<slug>.privateIp}`,
   * `@{<slug>.port}`, or `@{self.…}`. Resolved by the compute module when the
   * VM's .env is written, so inter-service wiring stays declared here next to
   * the env vars that consume it. Vars without a binding fall back to the
   * compute module's shared env pool (FRONTEND_URL, BACKEND_URL, …).
   */
  bindings?: Readonly<Record<string, string>>
  /** Inject `NODE_ENV`/`APP_MODE`/`TZ`. Default true; set false for the SPA proxy. */
  includeStandardEnv?: boolean
  /** Mount `.env` + `.env.runtime`. Default true; set false for the SPA proxy. */
  includeEnvFile?: boolean
  /** SIGTERM drain window for in-flight requests. Default `'30s'`. */
  stopGracePeriod?: string
}

/** The fork-owned service registry: slug → declarative config. */
export type AppServices = Readonly<Record<string, AppServiceConfig>>
