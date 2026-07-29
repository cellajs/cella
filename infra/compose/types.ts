import type { Environment } from '../lib/stack/bootstrap-stack-state'

/**
 * VM cutover strategy: `lb-overlap` health-gates and drains overlapping generations;
 * `exclusive` releases a singleton resource before replacement starts.
 */
export type ReplacementStrategy = 'lb-overlap' | 'exclusive'

/**
 * How the old generation is drained off the LB when it is de-registered:
 *  - 'requests': HTTP, `onMarkedDownAction: 'none'` lets in-flight requests
 *    finish over a short `drainSeconds` window (backend/frontend/ai).
 *  - 'reconnect': WebSocket sessions are NOT held; the old generation is
 *    de-registered and clients reconnect to the new one, resyncing from durable
 *    state (yjs). A few seconds is enough for clients to notice and re-dial.
 */
export type DrainPolicy = 'requests' | 'reconnect'

/**
 * Public load-balancer route: fallback app origin, dedicated host, or shared-host path.
 * An absent route keeps the service internal.
 */
export type LbRoute = 'default' | 'host' | 'path'

/**
 * Shared-host path prefix matched without stripping.
 * The service must serve under the same leading-slash, no-trailing-slash prefix; required for
 * path-routed services.
 */
export type LbPathBegin = `/${string}`

/** A service's VM size: one type for all modes, or a per-mode map. */
export type ServiceInstanceType = string | Partial<Record<Environment, string>>

/**
 * A one-shot release step run at a new generation's boot BEFORE the app starts
 * (expand-before-cutover), gated on exit 0. The engine runs the service image as
 * a companion; what the step DOES is app-defined. Mirrors Fly's release_command
 * / Render's pre-deploy: a schema migration, a data backfill, a seed.
 */
export interface ReleaseStep {
  /** Command override for the release container. Omit to use the image's default entrypoint. */
  command?: readonly string[]
  /** Env applied to the release container (e.g. a mode selector that runs migrations). */
  env?: Readonly<Record<string, string>>
  /** Env applied to the long-running app block whenever a release step exists (e.g. disable app-boot migration). */
  appEnv?: Readonly<Record<string, string>>
}

/**
 * Deployment metadata for one logical service, carried as the Compose `x-service` extension.
 * `lib/services.ts` derives the registry; removing a block removes all deployment resources,
 * while app configuration may disable it per deployment.
 */
export interface ServiceMeta {
  /**
  * Canonical service identifier: the compose profile, release SHA key, and VM
   * key. May differ from the YAML block name for slot-based services (the
   * `backend-blue` block carries `slug: 'backend'`).
   */
  slug: string
  /** Host/exposed port the reconciler probes for the identity health check. */
  healthPort: number
  /** Seconds the reconciler waits for the new container to pass its health check. */
  healthTimeoutSeconds: number
  /** HTTP status a healthy response returns, matched exactly by the LB health check. */
  healthExpectStatus: number
  /** Whether a one-shot release companion runs before rolling this service (derived from `release`). */
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
  /** Path-prefix route on the shared HTTPS frontend (same-origin migration); see LbPathBegin. */
  lbPathBegin?: LbPathBegin
  /** Long-lived LB timeouts (1h server/tunnel) for WebSocket services. */
  lbWebsockets?: boolean
  /** Private ACL-guarded LB frontend giving in-network consumers a stable, cutover-following address. */
  internalRoute?: boolean
  /** Service whose image this one reuses (mcp reuses backend); no own image built. */
  reusesImageOf?: string
  /** Dockerfile path for services that build their own image. Omit when `reusesImageOf` is set. */
  dockerfile?: string
  /** Build stage (`docker build --target`) within `dockerfile` for multi-target files (the root Dockerfile). Omit for single-target files. */
  target?: string
  /** Under `appConfig.singleVM`, this service runs in-process on the host VM (backend) */
  coHosted?: boolean
  /** Per-service VM size; an app resizes its fleet by editing this. Required: every service declares its own box. */
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
  restart: 'unless-stopped' | 'no' | 'always' | 'on-failure'
  command?: readonly string[]
  ports?: readonly string[]
  stop_grace_period?: string
  env_file?: readonly string[]
  environment?: Readonly<Record<string, string>>
  healthcheck?: HealthCheck
  /** Deploy metadata; presence marks a logical service. */
  'x-service'?: ServiceMeta
}

export interface ComposeFile {
  services: Readonly<Record<string, ComposeService>>
}

/**
 * Declarative app-owned service entry synthesized into Compose and deployment metadata.
 * The engine injects shared ingress, rollout, health, and environment machinery. Entry presence
 * determines whether the service belongs to the fleet.
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
   * Compose healthcheck `start_period`: the grace window before failing probes
   * count. Roughly the container's cold-boot time.
   */
  startPeriod: string
  /**
   * HTTP status this service's health endpoint returns when healthy, matched
   * exactly by the LB health check. Defaults to 200; API services that answer
   * with no body use 204.
   */
  healthExpectStatus?: number
  /**
  * How this service's VM generation is replaced on a deploy. `'lb-overlap'`
  * is for LB-exposed services; `'exclusive'` is for the singleton-slot cdc
  * worker, which cannot overlap because only one process can consume its
  * PostgreSQL replication slot.
   */
  replacementStrategy: ReplacementStrategy
  /**
   * A one-shot release step run before rolling this service (schema migration,
   * backfill, seed). Presence emits a companion container; see {@link ReleaseStep}.
   */
  release?: ReleaseStep
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
   * Omit for internal-only (no public LB backend; e.g. cdc).
   */
  lbRoute?: LbRoute
  /**
   * Additionally route `<prefix>` path-begins on the shared HTTPS frontend to
   * this service (same-origin migration, e.g. '/api'). Only meaningful with
   * `lbRoute`; see LbPathBegin for the exact matching/stripping semantics.
   */
  lbPathBegin?: LbPathBegin
  /**
   * Keep LB connections long-lived (1h server/tunnel timeouts) for services
   * speaking WebSockets through the LB (yjs). Only meaningful with `lbRoute`.
   */
  lbWebsockets?: boolean
  /**
   * Expose this service on a private, ACL-guarded LB frontend so consumers
   * inside the private network reach it at a STABLE address that follows every
   * cutover (`@{<slug>.internalHost}:@{<slug>.internalPort}` bindings). The
   * internal pool gets WebSocket-grade timeouts; only private-network sources
   * pass the frontend's ACLs.
   */
  internalRoute?: boolean
  /**
   * Service whose image this one reuses, so CI builds no separate image for it
   * (mcp reuses the backend image at the same SHA).
   */
  reusesImageOf?: string
  /** Dockerfile path for services that build their own image. Omit when `reusesImageOf` is set. */
  dockerfile?: string
  /** Build stage (`docker build --target`) within `dockerfile` for multi-target files (the root Dockerfile). Omit for single-target files. */
  target?: string
  /**
   * Under `appConfig.singleVM`, co-host this service in-process on the host
   * (backend) VM under the cost-saving single-VM deployment mode.
   * zero/low-traffic apps. Mirrors the in-process worker startup in
   * `backend/src/main.api.ts`; set on the backend's worker subsystems (cdc, yjs,
   * mcp), never on the host service or the SPA proxy. Ignored when `singleVM` is
   * false.
   */
  coHosted?: boolean
  /**
   * Per-service VM size: an app resizes its fleet by editing this. Required:
   * every service declares its own box (there is no fleet-wide fallback). A
   * single type for all modes, or a per-mode map.
   */
  instanceType: ServiceInstanceType
  /**
   * Service-specific environment variables (e.g. a worker's process-mode or
   * health-port var). Merged AFTER the standard env so it can override it.
   * The uniform `NODE_ENV`/`APP_MODE`/`TZ` are injected by the engine; don't
   * repeat them here.
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

/** The app-owned service registry: slug → declarative config. */
export type AppServices = Readonly<Record<string, AppServiceConfig>>
