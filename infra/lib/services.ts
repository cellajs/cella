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

/** Services that build & push their own image (exclude image-reuse services). */
export const imageServiceNames = services.filter((s) => !s.reusesImageOf).map((s) => s.slug);

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
 * Apply singleVM placement to any service list: the enabled set for compute, LB and key minting; the full registry for bootstrap-owned IAM.
 * Bootstrap-owned IAM (principals, policies, conditions) follows the registry, so an `enabled` toggle changes compute only and needs no privileged up.
 */
export function placeServices(definitions: readonly ServiceDefinition[], singleVM: boolean): PlacedServices {
  if (!singleVM) return { vm: definitions, coHosted: [], collocated: [] };
  const collocated = definitions.filter((s) => s.placement === 'host');
  for (const svc of collocated) {
    if (svc.primaryRollout)
      throw new Error(
        `services: '${svc.slug}' cannot combine placement 'host' with primaryRollout (the host cannot collocate onto itself).`,
      );
    if (svc.coHosted)
      throw new Error(
        `services: '${svc.slug}' cannot set both coHosted and placement 'host': in-process fold and container collocation are mutually exclusive.`,
      );
  }
  return {
    vm: definitions.filter((s) => !s.coHosted && s.placement !== 'host'),
    coHosted: definitions.filter((s) => s.coHosted),
    collocated,
  };
}

/** Enabled services receiving dedicated VMs. Single-VM mode drops co-hosted workers and host-collocated containers from compute while keeping their routing through the host target. */
export function deployedServices(
  serviceConfig: Record<string, EngineServiceEndpoint>,
  singleVM: boolean,
): readonly ServiceDefinition[] {
  return placeServices(enabledServices(serviceConfig), singleVM).vm;
}

/** Enabled workers folded into the host process under singleVM, empty when singleVM is off. Their runtime secrets union onto the host VM and a co-hosted `exclusive` worker forces an exclusive host cutover. */
export function coHostedServices(
  serviceConfig: Record<string, EngineServiceEndpoint>,
  singleVM: boolean,
): readonly ServiceDefinition[] {
  return placeServices(enabledServices(serviceConfig), singleVM).coHosted;
}

/** Enabled `placement: 'host'` containers the boot runner starts beside the host container under singleVM. Their LB pools follow the host cutover, their secrets union onto the host VM, and their compose blocks join the host's genId fingerprint. */
export function collocatedServices(
  serviceConfig: Record<string, EngineServiceEndpoint>,
  singleVM: boolean,
): readonly ServiceDefinition[] {
  return placeServices(enabledServices(serviceConfig), singleVM).collocated;
}

/** Resolve the VM replacement strategy. A singleVM host folding a stop-first worker must cut over stop-first too, so two replication-slot consumers never run at once. */
export function effectiveStrategy(
  serviceConfig: Record<string, EngineServiceEndpoint>,
  singleVM: boolean,
  svc: ServiceDefinition,
): ServiceDefinition['replacementStrategy'] {
  const host = deployedServices(serviceConfig, singleVM).find((s) => s.primaryRollout)?.slug;
  if (
    singleVM &&
    svc.slug === host &&
    [...coHostedServices(serviceConfig, singleVM), ...collocatedServices(serviceConfig, singleVM)].some(
      (s) => s.replacementStrategy === 'stop-first',
    )
  ) {
    return 'stop-first';
  }
  return svc.replacementStrategy;
}

/** Secret folders `service`'s VMs read, over `definitions`: itself plus, for the singleVM host, every folded co-hosted worker and collocated container. The host's secret-path grant must union identically or hydration 403s on the folded secrets. */
export function secretScopeSlugs(
  definitions: readonly ServiceDefinition[],
  singleVM: boolean,
  service: ServiceName,
): readonly ServiceName[] {
  const placed = placeServices(definitions, singleVM);
  const host = placed.vm.find((s) => s.primaryRollout)?.slug;
  if (!singleVM || service !== host) return [service];
  return [service, ...placed.coHosted.map((s) => s.slug), ...placed.collocated.map((s) => s.slug)];
}

/** Services owning an IAM principal and policy: every registry service under split-VM, only the host under singleVM. Registry-derived on purpose, so `enabled` never touches bootstrap-owned IAM; a registry service outside the deployed set is a dormant principal that must hold no key. */
export function principalServices(singleVM: boolean): readonly ServiceDefinition[] {
  return placeServices(services, singleVM).vm;
}

/** Secret scope of a principal's policy condition, over the full registry. Feeds both the Pulumi program and the deploy's grant assertion, which compare the resulting condition as a string. */
export function principalSecretScopeSlugs(singleVM: boolean, service: ServiceName): readonly ServiceName[] {
  return secretScopeSlugs(services, singleVM, service);
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
  return {
    spaBucket: browserOriginSlug !== undefined,
    uploadBuckets: definitions.some((s) => s.s3Access),
    browserOriginSlug,
  };
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
