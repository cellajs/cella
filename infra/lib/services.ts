/**
 * Service registry schema + derived helpers.
 *
 * The editable list of services lives in `./services-config.ts`; this module
 * owns the types and everything the rest of infra derives from that list, so no
 * other surface re-declares `['backend','cdc','yjs','ai','frontend']`:
 *   - resources/compute.ts     — one VM per enabled service + its compose env
 *   - resources/loadbalancer.ts — which services get a public LB backend/route
 *   - resources/deploy-tags.ts — one S3 tag object per service
 *   - reconciler/index.ts      — per-VM reconciler env (compose profile == slug,
 *                                health port, rollover strategy, …)
 *   - tasks/wait-for-images.ts — which images CI waits for in the registry
 *   - lib/runtime-secrets.ts   — which services a runtime secret is exposed to
 */
import { services } from './services-config.js'

export type ServiceName = 'backend' | 'cdc' | 'yjs' | 'ai' | 'frontend'

/** appConfig.has.* feature flags that gate an optional service. */
export type ServiceFeatureFlag = 'yjs' | 'ai'

export interface ServiceDefinition {
  /**
   * Stable service identifier. Doubles as the compose profile name (mirrors
   * compose.yml `profiles:`) and the per-service deploy-tag / VM key, so the
   * slug must match the compose profile exactly.
   */
  slug: ServiceName
  /**
   * Service whose image this one reuses. When set, CI builds/pushes NO image
   * for this service and `wait-for-images` does not wait for one — the VM pulls
   * the reused service's image at the same SHA. `ai` reuses the backend image.
   */
  reusesImageOf?: ServiceName
  /** Host/exposed port the reconciler probes for the identity health check. */
  healthPort: number
  /**
   * Seconds the reconciler waits for the new container to answer /health with
   * the desired X-App-Version before rolling back. The backend image is heavy
   * (it runs warmup on boot), so it needs a larger budget than the lightweight
   * services — too tight a window causes a rollback loop. ai reuses the backend
   * image, so it gets the same budget.
   */
  healthTimeoutSeconds: number
  /**
   * When true, the reconciler runs the one-shot `migrate` compose service to
   * apply schema migrations BEFORE rolling this service's app container
   * (expand-before-rollover). Only the backend owns the schema; ai reuses the
   * backend image but must NOT migrate (it is a worker that waits for the API).
   */
  runMigrate: boolean
  /**
   * How the reconciler rolls this service:
   *  - 'in-place'   — recreate the single app container behind the ingress.
   *  - 'blue-green' — run two named slots (`<svc>-blue` / `<svc>-green`) and
   *    flip the ingress upstream between them. The idle slot is brought up on
   *    the new tag and identity-gated BEFORE any traffic moves, so a bad
   *    release never replaces the serving container.
   * Only the backend opts into blue-green today (stateless + critical, and it
   * owns migrations); the lighter services keep the simpler in-place roll. cdc
   * MUST stay in-place: it holds a single PostgreSQL logical replication slot,
   * so running two slots (blue + green) at once would have both workers consume
   * the same slot — a correctness bug, not just wasted RAM. in-place guarantees
   * exactly one cdc worker exists at any moment.
   * See infra/INFRA_ARCHITECTURE.md (Zero-downtime deploys).
   */
  rolloverStrategy: 'in-place' | 'blue-green'
  /**
   * For blue-green services only: seconds the old slot keeps serving in-flight
   * requests AFTER the ingress has flipped to the new slot, before the old slot
   * is stopped. Lets long-ish requests drain on the retired slot. 0 for the
   * in-place services (unused).
   */
  drainSeconds: number
  /**
   * appConfig.has.* flag that gates this service. When set, the service is only
   * deployed if that flag is true (see `enabledServices`). Absent = always on.
   */
  featureFlag?: ServiceFeatureFlag
  /**
   * How the load balancer exposes this service publicly:
   *  - 'default' — the LB's fallback backend (the API; reached when no host
   *    route matches).
   *  - 'host'    — host-header routed (its own DNS record + cert + route).
   * Absent = internal-only, no public LB backend (cdc reaches the backend over
   * the private network, never through the LB).
   */
  lbRoute?: 'default' | 'host'
  /**
   * Where the service runs:
   *  - 'dedicated-vm'   — its own Scaleway VM (today's model; the default when
   *    omitted).
   *  - 'shared-workers' — co-located as a container on a shared workers VM.
   * The shared-workers placement is the lever for the multi-fork "N worker
   * containers on one VM" model (see info/MULTI_FORK_SHARING.md) and is not yet
   * implemented by the compute module.
   */
  placement?: 'dedicated-vm' | 'shared-workers'
  /**
   * Scaleway commercial instance type (VM size) for this service's dedicated
   * VM — the per-service default a fork edits in services-config.ts to size its
   * fleet without touching Pulumi config. Either a single size applied in every
   * deploy mode, or a per-mode map (e.g. a bigger box in production, a cheaper
   * one in staging). backend needs DEV1-M in production because its blue-green
   * roll runs OLD + NEW slots side-by-side (~2× RAM) during cutover — DEV1-S
   * (2 GB) cannot hold both. Absent (or a mode not in the map) = the fleet-wide
   * default (`infra:instanceType`, DEV1-S). An operator can still override per
   * service at deploy time via `pulumi config set --path
   * infra:instanceTypes.<slug>` (highest precedence).
   */
  instanceType?: ServiceInstanceType
}

/**
 * A service's VM size: one commercial type for all modes, or a per-mode map.
 * Only the deployable modes (`production`, `staging`) are meaningful; a mode
 * absent from the map falls back to the fleet default.
 */
export type ServiceInstanceType = string | Partial<Record<'production' | 'staging', string>>

export { services }

/** Ordered service slugs — the canonical list every consumer derives from. */
export const serviceNames = services.map((s) => s.slug)

/** Lookup a service definition by slug. */
export const servicesByName = new Map<ServiceName, ServiceDefinition>(services.map((s) => [s.slug, s]))

/** Services that build & push their own image (exclude image-reuse services). */
export const imageServiceNames = services.filter((s) => !s.reusesImageOf).map((s) => s.slug)

/**
 * Services enabled for an app given its feature flags. A service with no
 * `featureFlag` is always enabled; one with a flag is included only when that
 * flag is true. Single source of truth for "which services this app deploys" —
 * compute (VMs), the load balancer, and any future deploy-plan artifact all
 * derive from it instead of re-checking `appConfig.has.*` independently.
 */
export function enabledServices(has: Record<ServiceFeatureFlag, boolean>): readonly ServiceDefinition[] {
  return services.filter((s) => !s.featureFlag || has[s.featureFlag])
}
