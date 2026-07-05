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

/**
 * How a service's VM generation is cut over on a deploy (immutable-node model):
 *  - 'lb-overlap' — create the new generation, health-gate it, atomically
 *    expand the LB to both generations then contract to the new one, drain the
 *    old (backend/frontend/yjs/ai).
 *  - 'exclusive'  — no LB overlap possible; the old generation must fully
 *    release a singleton resource before the new one takes over (cdc holds one
 *    PostgreSQL replication slot).
 */
export type ReplacementStrategy = 'lb-overlap' | 'exclusive'

/**
 * How the old generation is drained off the LB when it is de-registered:
 *  - 'requests'  — HTTP: `onMarkedDownAction: 'none'` lets in-flight requests
 *    finish over a short `drainSeconds` window (backend/frontend/ai).
 *  - 'reconnect' — WebSocket: sessions are NOT held; the old generation is
 *    de-registered and clients reconnect to the new one, resyncing from durable
 *    state (yjs). A few seconds is enough for clients to notice and re-dial.
 */
export type DrainPolicy = 'requests' | 'reconnect'

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
 * backend, DNS, cert, or release SHA config). Optional per-app deployment is
 * gated by `appConfig.services.<slug>.enabled` (see `enabledServices`).
 */
export interface ServiceMeta {
  /**
  * Canonical service identifier — the compose profile, release SHA key, and VM
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
  /** Deploy this service before the rest of the VM fleet. At most one enabled service may set this. */
  primaryRollout?: boolean
  /**
   * How this service's VM generation is cut over on a deploy. `'lb-overlap'`
   * for LB-exposed services (overlap two generations behind the LB);
   * `'exclusive'` for the singleton-slot cdc worker.
   */
  replacementStrategy: ReplacementStrategy
  /**
   * How the old generation drains off the LB. `'requests'` (HTTP, finish
   * in-flight) or `'reconnect'` (WebSocket, clients re-dial). Omit for the
   * LB-less `exclusive` worker.
   */
  drainPolicy?: DrainPolicy
  /** Drain window (seconds) the cutover waits after the old generation is de-registered; 0 for none. */
  drainSeconds: number
  /** Public LB exposure; absent = internal-only. */
  lbRoute?: LbRoute
  /** Long-lived LB timeouts (1h server/tunnel) for WebSocket services. */
  lbWebsockets?: boolean
  /** Service whose image this one reuses (ai reuses backend); no own image built. */
  reusesImageOf?: string
  /** Dockerfile path for services that build their own image. Omit when `reusesImageOf` is set. */
  dockerfile?: string
  /** Under `appConfig.singleVM`, this service runs in-process on the host VM (backend) */
  coHosted?: boolean
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
  stop_grace_period?: string
  env_file?: readonly string[]
  environment?: Readonly<Record<string, string>>
  healthcheck?: HealthCheck
  /** Deploy-plane metadata; presence marks a logical service. */
  'x-service'?: ServiceMeta
}

export interface ComposeFile {
  services: Readonly<Record<string, ComposeService>>
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
  * How this service's VM generation is replaced on a deploy. `'lb-overlap'`
  * is for LB-exposed services; `'exclusive'` is for the singleton-slot cdc
  * worker, which cannot overlap because only one process can consume its
  * PostgreSQL replication slot.
   */
  replacementStrategy: ReplacementStrategy
  /** Run the one-shot `migrate` service before rolling. Backend-only today. */
  runMigrate?: boolean
  /** Deploy this service before the rest of the VM fleet. At most one enabled service may set this. */
  primaryRollout?: boolean
  /**
   * How the old generation drains off the LB when de-registered. `'requests'`
   * (HTTP) or `'reconnect'` (WebSocket). Omit for the LB-less `exclusive` worker.
   */
  drainPolicy?: DrainPolicy
  /** Drain window (seconds) the cutover waits after the old generation is de-registered; defaults to 0. */
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
  /** Dockerfile path for services that build their own image. Omit when `reusesImageOf` is set. */
  dockerfile?: string
  /**
   * Under `appConfig.singleVM`, co-host this service in-process on the host
   * (backend) VM instead of giving it its own VM — the cost escape hatch for
   * zero/low-traffic apps. Mirrors the in-process worker startup in
   * `backend/src/main.api.ts`; set on the backend's worker subsystems (cdc, yjs,
   * ai), never on the host service or the SPA proxy. Ignored when `singleVM` is
   * false.
   */
  coHosted?: boolean
  /**
   * Per-service VM size — a fork resizes its fleet by editing this. Required:
   * every service declares its own box (there is no fleet-wide fallback). A
   * single type for all modes, or a per-mode map.
   */
  instanceType: ServiceInstanceType
  /**
   * Service-specific environment variables (e.g. cdc's `API_WS_URL`, ai's
   * `MODE: mcp-worker`). Merged AFTER the standard env so it can override it.
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
