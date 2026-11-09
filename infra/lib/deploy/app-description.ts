import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { supportedImageContract, supportedSchemaVersion } from '../../agent/src/plan';
import type { EngineConfig } from '../../config/engine-config';
import { infraDir } from '../utils/paths';
import { descriptionHash } from './applied-engine';
import { supplierContext } from './static-env';

/** The fields of the engine config the engine reads, and no other field of the app's config: a change to one of them owes an apply. */
function engineFields(config: EngineConfig): EngineConfig {
  const { s3 } = config;
  return {
    slug: config.slug,
    appSlug: config.appSlug,
    mode: config.mode,
    domain: config.domain,
    frontendUrl: config.frontendUrl,
    backendUrl: config.backendUrl,
    singleVM: config.singleVM,
    s3: {
      region: s3.region,
      host: s3.host,
      publicBucket: s3.publicBucket,
      privateBucket: s3.privateBucket,
      publicCDNUrl: s3.publicCDNUrl,
      privateCDNUrl: s3.privateCDNUrl,
    },
    services: Object.fromEntries(Object.entries(config.services).map(([slug, { enabled, publicUrl }]) => [slug, { enabled, publicUrl }])),
    mapStyleUrls: config.mapStyleUrls,
  };
}

/**
 * The app as the engine of one environment sees it: the engine config's fields, every registry under `config/` the apply and the deploy
 * read (the runtime secrets and managed keys as the engine reads them), each env supplier's value, the boot plan's contract version, and
 * the Node, pnpm and repository the root `package.json` names, which the builder and the engine run on. A store is described by its kind and its factory's
 * settings. Run once `APP_MODE` names the environment: the engine config and the registries load here.
 * @param root the checkout whose `package.json` is read
 */
export async function appDescription(root = join(infraDir, '..')): Promise<Record<string, unknown>> {
  const [
    { engineConfig: config },
    { runtimeSecrets },
    { managedKeys },
    { appStores },
    { appServices, processIdentityEnv },
    { generalConfig },
    { healthContract },
    { appEnvSuppliers },
  ] = await Promise.all([
    import('../../config/engine-config'),
    import('../runtime-secrets'),
    import('../managed-keys'),
    import('../../config/stores.config'),
    import('../../config/services.config'),
    import('../../config/general.config'),
    import('../../config/health.config'),
    import('../../config/env-suppliers.config'),
  ]);
  const context = supplierContext(config);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
    packageManager?: string;
    repository?: string;
  };
  return {
    engine: engineFields(config),
    toolchain: { node: pkg.engines?.node, packageManager: pkg.packageManager, repository: pkg.repository },
    // The agent is the release's and its boot plan the engine's: the contract they share must match.
    bootPlan: { schemaVersion: supportedSchemaVersion, imageContract: supportedImageContract },
    services: appServices,
    processIdentityEnv,
    general: generalConfig,
    health: healthContract,
    runtimeSecrets,
    stores: Object.fromEntries(Object.entries(appStores).map(([id, store]) => [id, { kind: store.kind, settings: store.settings }])),
    managedKeys,
    env: Object.fromEntries(Object.entries(appEnvSuppliers).map(([name, supply]) => [name, supply(context)])),
  };
}

/** The hash of this checkout's description of the app for the loaded environment: one function for the apply, the engine image and the builder. */
export async function appDescriptionHash(root?: string): Promise<string> {
  return descriptionHash(await appDescription(root));
}
