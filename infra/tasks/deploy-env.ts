import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import { buildGrantRows } from '../lib/scaleway/grant-rows';
import { appStorageNeeds, deployedServices, enabledServices, serviceEndpoints } from '../lib/services';

type Cfg = EngineConfig;

/** Exact set of keys this script is allowed to emit. Tests lock this. */
export const ALLOWED_KEYS = [
  'environment',
  'image_tag',
  'pulumi_stack',
  'region',
  'registry_ns',
  'frontend_bucket',
  'public_bucket',
  'state_bucket',
  'diag_bucket',
  'grant_rows_json',
  'enabled_services_json',
  'build_images_matrix',
  'primary_rollout_matrix',
  'roll_rest_matrix',
] as const;
export type AllowedKey = (typeof ALLOWED_KEYS)[number];

/** Pure builder that produces the deploy env table from an appConfig. */
export function buildDeployEnv(appConfig: Cfg, opts: { imageTag?: string } = {}): Record<AllowedKey, string> {
  const { naming } = deriveInfra(appConfig);
  const enabled = enabledServices(appConfig.services);
  const serviceUrls = appConfig.services as Record<string, { publicUrl?: string }>;
  const serviceUrl = (slug: string): string => serviceUrls[slug]?.publicUrl ?? '';
  const urls = new Map(serviceEndpoints(appConfig).map((endpoint) => [endpoint.slug, endpoint.url]));
  const enabledServiceRows = enabled.map((service) => ({
    service: service.slug,
    public_url: serviceUrl(service.slug),
    health_url: service.lbRoute ? (urls.get(service.slug) ?? '') : '',
    lb_route: service.lbRoute ?? '',
    dockerfile: service.dockerfile ?? '',
    reuses_image_of: service.reusesImageOf ?? '',
    primary_rollout: service.primaryRollout === true,
  }));
  const primaryServices = enabled.filter((service) => service.primaryRollout);
  if (primaryServices.length > 1) {
    const slugs = primaryServices.map((service) => service.slug).join(', ');
    throw new Error(`At most one enabled service may set primaryRollout: true (${slugs})`);
  }
  const primaryService = primaryServices[0];
  // Include only services that own VM generations; single-VM workers cut over with their host.
  // This mirrors the compute resource set.
  const deployedSlugs = new Set(deployedServices(appConfig.services, appConfig.singleVM).map((service) => service.slug));
  const rolloutRows = enabledServiceRows.filter((item) => deployedSlugs.has(item.service));
  const primaryRollout = primaryService
    ? rolloutRows.filter((item) => item.service === primaryService.slug).map(({ service, health_url }) => ({ service, health_url }))
    : [];
  const restRows = primaryService ? rolloutRows.filter((item) => item.service !== primaryService.slug) : rolloutRows;
  const restRollout = restRows.map(({ service, health_url }) => ({ service, health_url }));
  const buildImages = enabled
    .filter((service) => !service.reusesImageOf)
    .map((service) => {
      if (!service.dockerfile) throw new Error(`Service '${service.slug}' builds its own image but has no dockerfile in services.config.ts`);
      return { service: service.slug, dockerfile: service.dockerfile, target: service.target ?? '' };
    });

  return {
    environment: appConfig.mode,
    image_tag: opts.imageTag ?? '',
    pulumi_stack: appConfig.mode,
    region: appConfig.s3.region,
    registry_ns: naming.registryNamespace,
    // Empty when the registry implies no SPA bucket (frontend-less app); the
    // deploy skips asset upload + entry publish on ''.
    frontend_bucket: appStorageNeeds(enabled).spaBucket ? naming.frontendBucket : '',
    public_bucket: appStorageNeeds(enabled).uploadBuckets ? naming.publicBucket : '',
    state_bucket: naming.pulumiStateBucket,
    diag_bucket: naming.bootDiagBucket,
    grant_rows_json: JSON.stringify(buildGrantRows(appConfig)),
    enabled_services_json: JSON.stringify(enabledServiceRows),
    build_images_matrix: JSON.stringify(buildImages),
    primary_rollout_matrix: JSON.stringify(primaryRollout),
    roll_rest_matrix: JSON.stringify(restRollout),
  };
}
