/**
 * Service registry adapter — re-exposes the typed Compose model as the
 * `ServiceDefinition` registry the rest of infra consumes.
 *
 * The canonical registry lives in `infra/compose/`: a fork edits
 * `compose/services.config.ts`, and `compose/compose.ts` derives the ordered
 * `x-service` metadata (`ServiceMeta[]`) from the assembled Compose model. This
 * module adapts that metadata to `ServiceDefinition` and is the single place
 * every other surface derives the service set from, so none re-declares
 * `['backend','cdc','yjs','ai','frontend']`:
 *   - resources/compute.ts      — one VM per enabled service + its compose env
 *   - resources/loadbalancer.ts — which services get a public LB backend/route
 *   - resources/deploy-tags.ts  — one S3 tag object per service
 *   - reconciler/index.ts       — per-VM reconciler env (compose profile == slug,
 *                                 health port, rollover strategy, …)
 *   - tasks/wait-for-images.ts  — which images CI waits for in the registry
 *   - lib/runtime-secrets.ts    — which services a runtime secret is exposed to
 */
import { services as composeServices, type ServiceName } from '../compose/compose'
import type { ServiceMeta, ServiceInstanceType } from '../compose/types'
// Type-only — erased at compile, so this module stays appConfig-free at runtime
// (helpers.ts imports it before setting APP_MODE; see `serviceEndpoints` below).
import type { appConfig as AppConfig } from '../../shared'

export type { ServiceName, ServiceInstanceType }

/** appConfig.has.* feature flags that gate an optional service. */
export type ServiceFeatureFlag = 'yjs' | 'ai'

/**
 * One deployable service — the Compose model's `x-service` (`ServiceMeta`) narrowed
 * to this app's slug and feature-flag unions, plus `placement`. Field meanings
 * are documented on `ServiceMeta` in `../compose/types.ts`; every other infra
 * surface derives from this list (see this module's header).
 */
export interface ServiceDefinition extends ServiceMeta {
  slug: ServiceName
  featureFlag?: ServiceFeatureFlag
  /**
   * Where the service runs:
   *  - 'dedicated-vm'   — its own Scaleway VM (today's model; the default when
   *    omitted).
   *  - 'shared-workers' — co-located as a container on a shared workers VM.
   * The shared-workers placement is the lever for the multi-fork "N worker
   * containers on one VM" model (see info/MULTI_FORK_SHARING.md) and is not yet
   * implemented by the compute module — no service sets it today.
   */
  placement?: 'dedicated-vm' | 'shared-workers'
}

/** Ordered service definitions, derived from the typed Compose model. */
export const services = composeServices as readonly ServiceDefinition[]

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

/** A public service's resolved endpoint, derived from appConfig by the registry. */
export interface ServiceEndpoint {
  slug: ServiceName
  /** Full public URL from appConfig (e.g. `https://api.example.com`). */
  url: string
  /** Hostname only (e.g. `api.example.com`) — for DNS records, certs, LB routes. */
  host: string
}

/** Public URL for a service slug; undefined for internal-only services (cdc). */
function publicUrl(slug: ServiceName, cfg: typeof AppConfig): string | undefined {
  switch (slug) {
    case 'frontend':
      return cfg.frontendUrl
    case 'backend':
      return cfg.backendUrl
    case 'yjs':
      return cfg.yjsUrl
    case 'ai':
      return cfg.aiUrl
    default:
      return undefined
  }
}

/**
 * Per-service public endpoints, derived from appConfig by the registry instead
 * of a hand-maintained parallel map in `naming.ts`. A service has an endpoint
 * iff it declares an `lbRoute` (cdc has none → internal-only, omitted here).
 *
 * Pure: pass the resolved appConfig. This module never reads appConfig eagerly
 * (helpers.ts imports it before APP_MODE is set), so the lookup must be a
 * function, not a module-level constant.
 */
export function serviceEndpoints(cfg: typeof AppConfig): readonly ServiceEndpoint[] {
  return services
    .filter((s) => s.lbRoute)
    .map((s) => {
      const url = publicUrl(s.slug, cfg)
      if (!url) throw new Error(`Public service '${s.slug}' (lbRoute set) has no URL in appConfig`)
      return { slug: s.slug, url, host: new URL(url).hostname }
    })
}
