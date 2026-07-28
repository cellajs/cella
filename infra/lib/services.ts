import { services as composeServices, type ServiceName } from '../compose/compose'
import type { ServiceMeta } from '../compose/types'
import type { EngineConfig, EngineServiceEndpoint } from '../config/engine-config'

/**
 * One deployable service: the Compose model's `x-service` (`ServiceMeta`) narrowed
 * to this app's slug, plus `placement`. Field meanings
 * are documented on `ServiceMeta` in `../compose/types.ts`; every other infra
 * surface derives from this list (see this module's header).
 */
export interface ServiceDefinition extends ServiceMeta {
  slug: ServiceName
  /** Service placement. Only dedicated VMs are currently supported. */
  placement?: 'dedicated-vm' | 'shared-workers'
}

/** Ordered service definitions, derived from the typed Compose model. */
export const services = composeServices as readonly ServiceDefinition[]

/** Ordered service slugs: the canonical list every consumer derives from. */
export const serviceNames = services.map((s) => s.slug)

/** Lookup a service definition by slug. */
export const servicesByName = new Map<ServiceName, ServiceDefinition>(services.map((s) => [s.slug, s]))

/** Services that build & push their own image (exclude image-reuse services). */
export const imageServiceNames = services.filter((s) => !s.reusesImageOf).map((s) => s.slug)

/**
 * Services enabled for an app given appConfig.services. Services are enabled by
 * default; a service entry can opt out with `{ enabled: false }`. Single source
 * of truth for "which services this app deploys": compute (VMs), the load
 * balancer, and any future deploy-plan artifact all derive from it.
 */
export function enabledServices(serviceConfig: Record<string, EngineServiceEndpoint>): readonly ServiceDefinition[] {
  return services.filter((s) => serviceConfig[s.slug]?.enabled !== false)
}

/**
 * Returns services receiving dedicated VMs.
 * Single-VM mode removes co-hosted workers from compute while preserving their enabled routing
 * through the host target.
 */
export function deployedServices(
  serviceConfig: Record<string, EngineServiceEndpoint>,
  singleVM: boolean,
): readonly ServiceDefinition[] {
  const enabled = enabledServices(serviceConfig)
  if (!singleVM) return enabled
  return enabled.filter((s) => !s.coHosted)
}

/**
 * Enabled co-hosted worker services for an app under singleVM (empty when
 * singleVM is off), the workers folded into the host process; this unions
 * their runtime secrets onto the host VM and to gate the host's replacement
 * strategy (a co-hosted `exclusive` worker forces the host to cut over
 * exclusively).
 */
export function coHostedServices(
  serviceConfig: Record<string, EngineServiceEndpoint>,
  singleVM: boolean,
): readonly ServiceDefinition[] {
  if (!singleVM) return []
  return enabledServices(serviceConfig).filter((s) => s.coHosted)
}

/** A public service's resolved endpoint, derived from appConfig by the registry. */
export interface ServiceEndpoint {
  slug: ServiceName
  /** Full public URL from appConfig (e.g. `https://api.example.com`). */
  url: string
  /** Hostname only (e.g. `api.example.com`), for DNS records, certs, LB routes. */
  host: string
}

/**
 * The registry derives per-service public endpoints directly from appConfig. A service has an endpoint
 * iff it declares an `lbRoute` (cdc has none → internal-only, omitted here).
 *
 * Pure: pass the resolved appConfig. This module never reads appConfig eagerly
 * (helpers.ts imports it before APP_MODE is set), so the lookup must be a
 * function, not a module-level constant.
 */
export function serviceEndpoints(cfg: EngineConfig): readonly ServiceEndpoint[] {
  const serviceUrls = cfg.services as Record<string, EngineServiceEndpoint>
  return services
    .filter((s) => s.lbRoute)
    .map((s) => {
      const url = serviceUrls[s.slug]?.publicUrl
      if (!url) throw new Error(`Public service '${s.slug}' (lbRoute set) has no URL in appConfig`)
      return { slug: s.slug, url, host: new URL(url).hostname }
    })
}
