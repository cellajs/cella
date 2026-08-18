import type { Environment } from '../lib/stack/bootstrap-stack-state';

/** VM cutover strategy: `start-first` overlaps generations behind the LB; `stop-first` releases a singleton resource before replacement starts. */
export type ReplacementStrategy = 'start-first' | 'stop-first';

/**
 * How the old generation is drained off the LB when it is de-registered.
 * `requests`: HTTP, `onMarkedDownAction: 'none'` lets in-flight requests finish over `drainSeconds`.
 * `reconnect`: WebSocket sessions are not held; clients re-dial the new generation and resync from durable state.
 */
export type DrainPolicy = 'requests' | 'reconnect';

/** Public load-balancer route: fallback app origin, dedicated host, or shared-host path. Absent keeps the service internal. */
export type LbRoute = 'default' | 'host' | 'path';

/** Shared-host path prefix matched without stripping: leading slash, no trailing slash, and the service must serve under it. */
export type PathPrefix = `/${string}`;

/** A service's VM size: one type for all modes, or a per-mode map. */
export type ServiceInstanceType = string | Partial<Record<Environment, string>>;

/** Where a service's container runs: its own VM generation, or collocated on the singleVM host. */
export type ServicePlacement = 'vm' | 'host';

/**
 * A one-shot release step run at a new generation's boot before the app starts (expand-before-cutover), gated on exit 0.
 * The engine runs the service image as a companion; what the step does is app-defined (schema migration, backfill, seed).
 */
export interface ReleaseStep {
  /** Command override for the release container. Omit to use the image's default entrypoint. */
  command?: readonly string[];
  /** Env applied to the release container (e.g. an app-owned process selector). */
  env?: Readonly<Record<string, string>>;
  /** Env applied to the long-running app block whenever a release step exists (e.g. disable app-boot migration). */
  appEnv?: Readonly<Record<string, string>>;
}

/**
 * Deployment metadata for one logical service, carried as the Compose `x-service` extension.
 * `lib/services.ts` derives the registry; removing a block removes all deployment resources.
 * Members mirror {@link AppServiceConfig}, which documents them in full.
 */
export interface ServiceMeta {
  /** Canonical service identifier: compose profile, release SHA key, and VM key. May differ from the YAML block name for slot-based services. */
  slug: string;
  /** Host/exposed port the reconciler probes for the identity health check. */
  healthPort: number;
  /** Seconds the reconciler waits for the new container to pass its health check. */
  healthTimeoutSeconds: number;
  /** HTTP status a healthy response returns, matched exactly by the LB health check. */
  healthExpectStatus: number;
  /** Whether a one-shot release companion runs before rolling this service (derived from `release`). */
  runRelease: boolean;
  /** Deploy this service before the rest of the VM fleet. At most one enabled service may set this. */
  primaryRollout?: boolean;
  /** `start-first` for LB-exposed services; `stop-first` for the singleton-slot cdc worker. */
  replacementStrategy: ReplacementStrategy;
  /** How the old generation drains off the LB. Omit for the LB-less `stop-first` worker. */
  drainPolicy?: DrainPolicy;
  /** Drain window (seconds) the cutover waits after the old generation is de-registered; 0 for none. */
  drainSeconds: number;
  /** Public LB exposure; absent = internal-only. */
  lbRoute?: LbRoute;
  /** Path-prefix route on the shared HTTPS frontend; see PathPrefix. */
  pathPrefix?: PathPrefix;
  /** Long-lived LB timeouts (1h server/tunnel) for WebSocket services. */
  lbWebsockets?: boolean;
  /** Private ACL-guarded LB frontend giving in-network consumers a stable, cutover-following address. */
  internalRoute?: boolean;
  /** Service whose image this one reuses (mcp reuses backend); no own image built. */
  reusesImageOf?: string;
  /** Dockerfile path for services that build their own image. Omit when `reusesImageOf` is set. */
  dockerfile?: string;
  /** Build stage (`docker build --target`) within `dockerfile` for multi-target files. Omit for single-target files. */
  target?: string;
  /** Under `appConfig.singleVM`, this service runs in-process on the host VM. */
  coHosted?: boolean;
  /** Under `appConfig.singleVM`, `'host'` runs this service as a second container on the host VM. */
  placement?: ServicePlacement;
  /** Per-service VM size. Required: every service declares its own box. */
  instanceType: ServiceInstanceType;
  /** This service signs S3 requests with its own per-deploy service key (REQ-20). */
  s3Access?: boolean;
  /** Deploy-time env bindings resolved by the compute module; see {@link AppServiceConfig.bindings}. */
  bindings?: Readonly<Record<string, string>>;
}

export interface HealthCheck {
  test: readonly string[];
  interval: string;
  timeout: string;
  retries: number;
  start_period: string;
}

export interface ComposeService {
  image: string;
  profiles: readonly string[];
  restart: 'unless-stopped' | 'no' | 'always' | 'on-failure';
  command?: readonly string[];
  ports?: readonly string[];
  stop_grace_period?: string;
  env_file?: readonly string[];
  environment?: Readonly<Record<string, string>>;
  healthcheck?: HealthCheck;
  /** Deploy metadata; presence marks a logical service. */
  'x-service'?: ServiceMeta;
}

export interface ComposeFile {
  services: Readonly<Record<string, ComposeService>>;
}

/**
 * Declarative app-owned service entry synthesized into Compose and deployment metadata.
 * The engine injects shared ingress, rollout, health, and environment machinery.
 * Entry presence determines whether the service belongs to the fleet.
 */
export interface AppServiceConfig {
  /** This service signs S3 requests (uploads, presigned URLs) with its own per-deploy service key: IAM grants, bucket policy, and S3_ACCESS_KEY_ID/SECRET in its runtime env. */
  s3Access?: boolean;
  /** Container image ref, e.g. `'${REGISTRY}/yjs:${YJS_TAG:-latest}'`. */
  image: string;
  /** The single port this service listens on. Drives the Compose `expose:` and the reconciler's identity healthcheck. */
  port: number;
  /** Seconds the reconciler waits for a new container to answer the health path with the desired version before rolling back. Heavy images need a larger budget. */
  healthTimeoutSeconds: number;
  /** Compose healthcheck `start_period`: grace window before failing probes count, roughly the container's cold-boot time. */
  startPeriod: string;
  /** HTTP status this service's health endpoint returns when healthy, matched exactly by the LB health check. Defaults to 200; bodyless API responses use 204. */
  healthExpectStatus?: number;
  /** `'start-first'` for LB-exposed services; `'stop-first'` for the singleton-slot cdc worker, which cannot overlap because only one process can consume its PostgreSQL replication slot. */
  replacementStrategy: ReplacementStrategy;
  /** A one-shot release step run before rolling this service. Presence emits a companion container; see {@link ReleaseStep}. */
  release?: ReleaseStep;
  /** Deploy this service before the rest of the VM fleet. At most one enabled service may set this. */
  primaryRollout?: boolean;
  /** How the old generation drains off the LB when de-registered. Omit for the LB-less `stop-first` worker. */
  drainPolicy?: DrainPolicy;
  /** Drain window (seconds) the cutover waits after the old generation is de-registered; defaults to 0. */
  drainSeconds?: number;
  /** How the LB exposes this service publicly: `'default'` = fallback backend, `'host'` = own DNS record + cert + route. Omit for internal-only. */
  lbRoute?: LbRoute;
  /** Additionally route `<prefix>` path-begins on the shared HTTPS frontend to this service. Only meaningful with `lbRoute`; see PathPrefix. */
  pathPrefix?: PathPrefix;
  /** Keep LB connections long-lived (1h server/tunnel timeouts) for services speaking WebSockets through the LB. Only meaningful with `lbRoute`. */
  lbWebsockets?: boolean;
  /**
   * Expose this service on a private, ACL-guarded LB frontend so consumers inside the private network
   * reach it at a stable address that follows every cutover (`@{<slug>.internalHost}:@{<slug>.internalPort}`).
   * The internal pool gets WebSocket-grade timeouts; only private-network sources pass the frontend's ACLs.
   */
  internalRoute?: boolean;
  /** Service whose image this one reuses, so CI builds no separate image for it (mcp reuses the backend image at the same SHA). */
  reusesImageOf?: string;
  /** Dockerfile path for services that build their own image. Omit when `reusesImageOf` is set. */
  dockerfile?: string;
  /** Build stage (`docker build --target`) within `dockerfile` for multi-target files (the root Dockerfile). Omit for single-target files. */
  target?: string;
  /**
   * Under `appConfig.singleVM`, co-host this service in-process on the host (backend) VM.
   * Set on the backend's worker subsystems (cdc, yjs, mcp), never on the host service or the SPA proxy. Ignored when `singleVM` is false.
   */
  coHosted?: boolean;
  /**
   * Where this service's container runs. `'vm'` (default) gives it a dedicated VM generation. `'host'` collocates it as a
   * second container on the singleVM host VM: its LB pool follows the host cutover and its image/env join the host's genId
   * fingerprint. For services that cannot fold in-process (a different runtime than the host); ignored when `singleVM` is false.
   */
  placement?: ServicePlacement;
  /** Per-service VM size. Required: every service declares its own box, there is no fleet-wide fallback. A single type for all modes, or a per-mode map. */
  instanceType: ServiceInstanceType;
  /** Service-specific environment variables. Merged after the standard env so it can override it; do not repeat the engine-injected `NODE_ENV`/`APP_MODE`/`TZ`. */
  env?: Readonly<Record<string, string>>;
  /**
   * Deploy-time values for this service's `${VAR}` env placeholders, expressed as templates over other services:
   * `@{<slug>.url}`, `@{<slug>.privateIp}`, `@{<slug>.port}`, or `@{self.…}`. Resolved by the compute module when the
   * VM's .env is written. Vars without a binding fall back to the compute module's shared env pool (FRONTEND_URL, BACKEND_URL, …).
   */
  bindings?: Readonly<Record<string, string>>;
  /** Inject `NODE_ENV`/`APP_MODE`/`TZ`. Default true; set false for the SPA proxy. */
  includeStandardEnv?: boolean;
  /** Mount `.env` + `.env.runtime`. Default true; set false for the SPA proxy. */
  includeEnvFile?: boolean;
  /** SIGTERM drain window for in-flight requests. Default `'30s'`. */
  stopGracePeriod?: string;
}

/** The app-owned service registry: slug → declarative config. */
export type AppServices = Readonly<Record<string, AppServiceConfig>>;
