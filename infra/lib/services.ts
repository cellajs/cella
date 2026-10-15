import { services as composeServices, type ServiceName } from '../compose/compose';
import type { ServiceMeta } from '../compose/types';
import type { EngineConfig, EngineServiceEndpoint } from '../config/engine-config';

/** One deployable service: the Compose model's `x-service` (`ServiceMeta`) narrowed to this app's slug. Field meanings live on `ServiceMeta` in `../compose/types.ts`. */
export interface ServiceDefinition extends ServiceMeta {
  slug: ServiceName;
}

/** Ordered service definitions, derived from the typed Compose model. */
export const services = composeServices as readonly ServiceDefinition[];

/** Ordered service slugs: the canonical list every consumer derives from. */
export const serviceNames = services.map((s) => s.slug);

/** Lookup a service definition by slug. */
export const servicesByName = new Map<ServiceName, ServiceDefinition>(services.map((s) => [s.slug, s]));

/** Services enabled for an app. Enabled by default; an entry opts out with `{ enabled: false }`. Compute and the load balancer both derive from this list. */
export function enabledServices(serviceConfig: Record<string, EngineServiceEndpoint>): readonly ServiceDefinition[] {
  return services.filter((s) => serviceConfig[s.slug]?.enabled !== false);
}

/** A service list split by singleVM placement: `vm` owns VMs and IAM principals, `coHosted` folds into the host process, `collocated` runs as a container beside the host. Without singleVM everything is `vm`. */
export interface PlacedServices {
  vm: readonly ServiceDefinition[];
  coHosted: readonly ServiceDefinition[];
  collocated: readonly ServiceDefinition[];
}

/**
 * Apply singleVM placement to any service list: the enabled set for compute, LB and key handing-over; the full registry for the identities.
 * The identities (applications, policies, conditions) follow the registry, so an `enabled` toggle changes compute only and needs no identity update.
 */
export function placeServices(definitions: readonly ServiceDefinition[], singleVM: boolean): PlacedServices {
  if (!singleVM) return { vm: definitions, coHosted: [], collocated: [] };
  const collocated = definitions.filter((s) => s.placement === 'host');
  for (const svc of collocated) {
    if (svc.primaryRollout)
      throw new Error(`services: '${svc.slug}' cannot combine placement 'host' with primaryRollout (the host cannot collocate onto itself).`);
    if (svc.coHosted)
      throw new Error(
        `services: '${svc.slug}' cannot set both coHosted and placement 'host': in-process fold and container collocation are mutually exclusive.`,
      );
  }
  const vm = definitions.filter((s) => !s.coHosted && s.placement !== 'host');
  const coHosted = definitions.filter((s) => s.coHosted);
  return { vm, coHosted, collocated };
}

/** Enabled services receiving dedicated VMs. Single-VM mode drops co-hosted workers and host-collocated containers from compute while keeping their routing through the host target. */
export function deployedServices(serviceConfig: Record<string, EngineServiceEndpoint>, singleVM: boolean): readonly ServiceDefinition[] {
  return placeServices(enabledServices(serviceConfig), singleVM).vm;
}

/**
 * The service whose rollout pointer carries `slug`'s release: itself when it boots its own VM, the singleVM host when it runs in the host process or
 * as a container beside it, undefined when it is disabled.
 */
export function rolloutOwner(serviceConfig: Record<string, EngineServiceEndpoint>, singleVM: boolean, slug: string): ServiceName | undefined {
  const placed = placeServices(enabledServices(serviceConfig), singleVM);
  const own = placed.vm.find((s) => s.slug === slug);
  if (own) return own.slug;
  const onHost = [...placed.coHosted, ...placed.collocated].some((s) => s.slug === slug);
  return onHost ? placed.vm.find((s) => s.primaryRollout)?.slug : undefined;
}

/** Enabled workers folded into the host process under singleVM, empty when singleVM is off. Their runtime secrets union onto the host VM and a stop-first one makes the host a singleton host. */
export function coHostedServices(serviceConfig: Record<string, EngineServiceEndpoint>, singleVM: boolean): readonly ServiceDefinition[] {
  return placeServices(enabledServices(serviceConfig), singleVM).coHosted;
}

/** Enabled `placement: 'host'` containers the boot runner starts beside the host container under singleVM. Their LB pools follow the host cutover, their secrets union onto the host VM, and their compose blocks join the host's genId fingerprint. */
export function collocatedServices(serviceConfig: Record<string, EngineServiceEndpoint>, singleVM: boolean): readonly ServiceDefinition[] {
  return placeServices(enabledServices(serviceConfig), singleVM).collocated;
}

/**
 * True for the singleVM host when it runs a stop-first worker (the cdc replication slot, the cron maintainer). The host still cuts over start-first:
 * PostgreSQL lets one session hold the slot and pg-boss claims each cron period once, so the new generation's copies wait while the old VM lives.
 * They take over only once the old VM is gone, so the rollout reaps it right after promotion.
 */
export function isSingletonHost(serviceConfig: Record<string, EngineServiceEndpoint>, singleVM: boolean, svc: ServiceDefinition): boolean {
  if (!singleVM || !svc.primaryRollout) return false;
  const placed = placeServices(enabledServices(serviceConfig), singleVM);
  if (!placed.vm.some((s) => s.slug === svc.slug)) return false;
  return [...placed.coHosted, ...placed.collocated].some((s) => s.replacementStrategy === 'stop-first');
}

/**
 * Services owning an IAM principal and a policy: every registry service, wherever it runs. A host that carries several services receives one
 * key per service, so placement (singleVM, a worker folded into the host process) never changes an identity. Registry-derived on purpose, so
 * `enabled` never touches IAM: a registry service that is not enabled keeps its principal and its standing key, and nothing hands the key over.
 */
export function principalServices(): readonly ServiceDefinition[] {
  return services;
}

/** The services that run somewhere, each needing its key: every enabled service, on its own machine or on the singleVM host. */
export function runningServices(serviceConfig: Record<string, EngineServiceEndpoint>): readonly ServiceDefinition[] {
  return enabledServices(serviceConfig);
}

/**
 * App-owned object storage implied by the service registry: the SPA bucket follows the default-route service, the upload buckets follow any `s3Access` service, and browser CORS exists only when both do.
 * Engine-owned buckets (Pulumi state, boot-diag) are unconditional and absent here, so a registry with neither a default route nor an s3Access service provisions no app buckets.
 */
export function appStorageNeeds(definitions: readonly ServiceDefinition[]): {
  spaBucket: boolean;
  uploadBuckets: boolean;
  browserOriginSlug?: ServiceName;
} {
  const browserOriginSlug = definitions.find((s) => s.lbRoute === 'default')?.slug;
  const spaBucket = browserOriginSlug !== undefined;
  const uploadBuckets = definitions.some((s) => s.s3Access);
  return { spaBucket, uploadBuckets, browserOriginSlug };
}

/** A public service's resolved endpoint, derived from appConfig by the registry. */
export interface ServiceEndpoint {
  slug: ServiceName;
  /** Full public URL from appConfig (e.g. `https://api.example.com`). */
  url: string;
  /** Hostname only (e.g. `api.example.com`), for DNS records, certs, LB routes. */
  host: string;
}

/**
 * Per-service public endpoints from appConfig. A service has an endpoint only when it declares an `lbRoute`; internal-only services are omitted.
 * Must stay a function taking the resolved appConfig: this module is imported before APP_MODE is set, so it can never read appConfig at module level.
 */
export function serviceEndpoints(cfg: EngineConfig): readonly ServiceEndpoint[] {
  const serviceUrls = cfg.services as Record<string, EngineServiceEndpoint>;
  return services
    .filter((s) => s.lbRoute)
    .map((s) => {
      const url = serviceUrls[s.slug]?.publicUrl;
      if (!url) throw new Error(`Public service '${s.slug}' (lbRoute set) has no URL in appConfig`);
      return { slug: s.slug, url, host: new URL(url).hostname };
    });
}
