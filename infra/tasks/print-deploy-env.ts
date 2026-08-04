import type { EngineConfig } from '../config/engine-config';
import { deriveInfra } from '../lib/naming';
import {
  BACKEND_S3_PERMISSION_SETS,
  BOOT_PROJECT_PERMISSION_SETS,
  SERVICE_SECRET_PERMISSION_SETS,
} from '../lib/scaleway/permissions';
import { principalNames } from '../lib/scaleway/principals';
import { bootKeyCondition, serviceKeyCondition, vmSecretCondition } from '../lib/scaleway/vm-reader-secret';
import { deployedServices, enabledServices, serviceEndpoints, serviceNames } from '../lib/services';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

type Cfg = EngineConfig;

/** Exact set of keys this script is allowed to emit. Tests lock this. */
export const ALLOWED_KEYS = [
  'environment',
  'image_tag',
  'pulumi_stack',
  'region',
  'registry_ns',
  'frontend_bucket',
  'state_bucket',
  'vm_reader_app',
  'vm_secret_condition',
  'vm_assert_json',
  'enabled_services_json',
  'build_images_matrix',
  'primary_rollout_matrix',
  'roll_rest_matrix',
] as const;
export type AllowedKey = (typeof ALLOWED_KEYS)[number];

/**
 * Production may only deploy from a trusted ref. The deploy workflow triggers on
 * `release: published` (which runs on the release tag, e.g. `refs/tags/0.0.2`)
 * or manual `workflow_dispatch` from `main`. Both are allowed; anything else
 * (feature branches, arbitrary tags pushed by hand are still gated by the
 * workflow triggers) is rejected.
 */
export function isAllowedProductionRef(gitRef: string): boolean {
  return gitRef === 'refs/heads/main' || gitRef.startsWith('refs/tags/');
}

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
    throw new Error(
      `At most one enabled service may set primaryRollout: true (${primaryServices.map((service) => service.slug).join(', ')})`,
    );
  }
  const primaryService = primaryServices[0];
  // Include only services that own VM generations; single-VM workers cut over with their host.
  // This mirrors the compute resource set.
  const deployedSlugs = new Set(
    deployedServices(appConfig.services, appConfig.singleVM).map((service) => service.slug),
  );
  const rolloutRows = enabledServiceRows.filter((item) => deployedSlugs.has(item.service));
  const primaryRollout = primaryService
    ? rolloutRows
        .filter((item) => item.service === primaryService.slug)
        .map(({ service, health_url }) => ({ service, health_url }))
    : [];
  const restRollout = (
    primaryService ? rolloutRows.filter((item) => item.service !== primaryService.slug) : rolloutRows
  ).map(({ service, health_url }) => ({ service, health_url }));
  const buildImages = enabled
    .filter((service) => !service.reusesImageOf)
    .map((service) => {
      if (!service.dockerfile)
        throw new Error(`Service '${service.slug}' builds its own image but has no dockerfile in services.config.ts`);
      return { service: service.slug, dockerfile: service.dockerfile, target: service.target ?? '' };
    });

  return {
    environment: appConfig.mode,
    image_tag: opts.imageTag ?? '',
    pulumi_stack: appConfig.mode,
    region: appConfig.s3.region,
    registry_ns: naming.registryNamespace,
    frontend_bucket: naming.frontendBucket,
    state_bucket: naming.pulumiStateBucket,
    // Deterministic IAM application name for the VM reader identity (per-mode;
    // assert-vm-grants falls back to the legacy `<slug>-vm-reader` name for
    // pre-migration stacks). CI's "Verify VM reader IAM grant" step resolves
    // the application id by this name.
    vm_reader_app: `${appConfig.slug}-${appConfig.mode}-vm-reader`,
    // Exact CEL condition the VM secret rules must carry (REQ-9); built by the
    // same shared builder the Pulumi program uses, so the deploy's
    // assert-vm-grants step compares strings, not semantics.
    vm_secret_condition: vmSecretCondition(appConfig.slug, appConfig.mode, serviceNames),
    // v2 model: one assertion row per principal (exact sets + exact
    // condition), consumed by the deploy's grant-verification step when the
    // stack config says iamModel=v2.
    vm_assert_json: JSON.stringify([
      ...deployedServices(appConfig.services, appConfig.singleVM ?? false).map((svc) => ({
        app: principalNames(appConfig.slug, appConfig.mode).vmService(svc.slug),
        sets: [...SERVICE_SECRET_PERMISSION_SETS, ...(svc.s3Access ? BACKEND_S3_PERMISSION_SETS : [])],
        condition: serviceKeyCondition(appConfig.slug, appConfig.mode, svc.slug),
      })),
      {
        app: principalNames(appConfig.slug, appConfig.mode).boot,
        sets: [...BOOT_PROJECT_PERMISSION_SETS, ...SERVICE_SECRET_PERMISSION_SETS],
        condition: bootKeyCondition(appConfig.slug, appConfig.mode),
      },
    ]),
    enabled_services_json: JSON.stringify(enabledServiceRows),
    build_images_matrix: JSON.stringify(buildImages),
    primary_rollout_matrix: JSON.stringify(primaryRollout),
    roll_rest_matrix: JSON.stringify(restRollout),
  };
}

export async function main(): Promise<void> {
  const mode = process.argv[2];
  if (!mode) {
    console.error('Usage: print-deploy-env.ts <staging|production> [--git-ref refs/heads/main] [--git-sha <sha>]');
    process.exit(1);
  }
  const gitRef = getFlag(process.argv, '--git-ref');
  const gitSha = getFlag(process.argv, '--git-sha');
  if (mode === 'production' && gitRef && !isAllowedProductionRef(gitRef)) {
    console.error(`::error::Production deploys are only allowed from the main branch or a release tag (got ${gitRef})`);
    process.exit(1);
  }
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  if (appConfig.mode !== mode) {
    console.error(`Mode mismatch: requested "${mode}" but loaded config is "${appConfig.mode}"`);
    process.exit(1);
  }
  for (const [k, v] of Object.entries(buildDeployEnv(appConfig, { imageTag: gitSha }))) {
    console.info(`${k}=${v}`);
  }
}

if (isMain(import.meta.url)) await main();
