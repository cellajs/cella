import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { type EngineConfig, engineConfig } from '../../config/engine-config';
import { supplierContext } from '../env-suppliers';
import { infraDir } from '../utils/paths';
import { descriptionHash } from './applied-engine';

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
 * read (the runtime secrets and managed keys as the engine reads them), each env supplier's value, and the Node, pnpm and
 * repository the root `package.json` names, which the builder and the engine run on. A store is described by its kind and its factory's
 * settings. Run after `loadEngineConfig()`.
 * @param root the checkout whose `package.json` is read
 */
export async function appDescription(root = join(infraDir, '..')): Promise<Record<string, unknown>> {
  const config = engineConfig();
  // One after another: the registries import each other, and two graphs loading at once meet a binding before it is initialized.
  const { runtimeSecrets } = await import('../runtime-secrets');
  const { appStores } = await import('../../config/stores.config');
  const { appServices, processIdentityEnv } = await import('../../config/services.config');
  const { generalConfig } = await import('../../config/general.config');
  const { healthContract } = await import('../../config/health.config');
  const { managedKeys } = await import('../managed-keys');
  const { appEnvSuppliers } = await import('../../config/env-suppliers.config');
  const { telemetrySink } = await import('../../config/telemetry.config');
  const context = supplierContext(config);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
    packageManager?: string;
    repository?: string;
  };
  return {
    engine: engineFields(config),
    toolchain: { node: pkg.engines?.node, packageManager: pkg.packageManager, repository: pkg.repository },
    services: appServices,
    processIdentityEnv,
    general: generalConfig,
    health: healthContract,
    runtimeSecrets,
    stores: Object.fromEntries(Object.entries(appStores).map(([id, store]) => [id, { kind: store.kind, settings: store.settings }])),
    managedKeys,
    env: Object.fromEntries(Object.entries(appEnvSuppliers).map(([name, supply]) => [name, supply(context)])),
    telemetry: telemetrySink,
  };
}

/** The hash of this checkout's description of the app for the loaded environment: one function for the apply, the engine image and the builder. */
export async function appDescriptionHash(root?: string): Promise<string> {
  return descriptionHash(await appDescription(root));
}
