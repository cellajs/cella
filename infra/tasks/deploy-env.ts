import type { EngineConfig } from '../config/engine-config';
import { machineRoles } from '../lib/machine-roles';
import { deriveInfra } from '../lib/naming';
import { appStorageNeeds, enabledServices, serviceEndpoints } from '../lib/services';

type Cfg = EngineConfig;

/** Exact set of keys this script is allowed to emit. Tests lock this. */
export const ALLOWED_KEYS = [
  'environment',
  'image_tag',
  'stack',
  'region',
  'frontend_bucket',
  'public_bucket',
  'diag_bucket',
  'enabled_services_json',
  'build_images_matrix',
  'primary_role',
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
  const buildImages = enabled
    .filter((service) => !service.reusesImageOf)
    .map((service) => {
      if (!service.dockerfile) throw new Error(`Service '${service.slug}' builds its own image but has no dockerfile in services.config.ts`);
      return { service: service.slug, dockerfile: service.dockerfile, target: service.target ?? '' };
    });

  return {
    environment: appConfig.mode,
    image_tag: opts.imageTag ?? '',
    stack: appConfig.mode,
    region: appConfig.s3.region,
    // Empty when the registry implies no SPA bucket (frontend-less app); the deploy skips asset upload + entry publish on ''.
    frontend_bucket: appStorageNeeds(enabled).spaBucket ? naming.frontendBucket : '',
    public_bucket: appStorageNeeds(enabled).uploadBuckets ? naming.publicBucket : '',
    diag_bucket: naming.bootDiagBucket,
    enabled_services_json: JSON.stringify(enabledServiceRows),
    build_images_matrix: JSON.stringify(buildImages),
    primary_role: machineRoles(appConfig).find((role) => role.primary)?.role ?? '',
  };
}
