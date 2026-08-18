import { writeFile } from 'node:fs/promises';
import {
  createApiKey,
  deleteApiKey,
  type IamAuth,
  listApiKeys,
  resolveApplicationIdByName,
  type ScwApiKey,
} from '../lib/scaleway/iam-client';
import { principalNames } from '../lib/scaleway/principals';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { handoffServicePath } from '../lib/scaleway/secret-paths';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/**
 * How many API keys each service/boot app retains after a mint: the fresh key plus the previous generation's, covering blue-green overlap and presigned URLs.
 * URLs signed by the outgoing backend generation stay valid until the key from two deploys ago is pruned, at least one full deploy cycle.
 */
const KEYS_TO_KEEP = 2;

export interface MintGenerationKeysOptions {
  slug: string;
  mode: string;
  sha: string;
  region: string;
  projectId: string;
  organizationId: string;
  /** Deployed service slugs. */
  services: readonly string[];
  /** CI secret key: holds the conditioned IAMApplicationManager grant. */
  callerSecretKey: string;
  /** Where the JSON result lands (read by the Pulumi program via INFRA_GENERATION_KEYS_FILE). */
  outFile: string;
  log?: (msg: string) => void;
}

export interface GenerationKeys {
  /** Boot fetcher key pair, baked into every generation's cloud-init. */
  bootAccessKey: string;
  bootSecretKey: string;
  /** service slug → single-access handoff secret id holding that service's fresh key. */
  handoffSecretIds: Record<string, string>;
}

async function resolveAppId(auth: IamAuth, organizationId: string, name: string): Promise<string> {
  const id = await resolveApplicationIdByName(auth, organizationId, name);
  if (!id)
    throw new Error(`mint-generation-keys: IAM application '${name}' not found: run the infra CLI bootstrap first.`);
  return id;
}

/** Mint a fresh key on the app. Pruning runs separately, AFTER every handoff bundle is staged; see pruneStaleKeys. */
async function mintKey(
  auth: IamAuth,
  projectId: string,
  appId: string,
  label: string,
  sha: string,
): Promise<ScwApiKey> {
  return createApiKey(auth, {
    applicationId: appId,
    description: `${label} gen ${sha.slice(0, 10)}`,
    defaultProjectId: projectId,
  });
}

/** Delete all but the newest KEYS_TO_KEEP keys on the app. */
async function pruneStaleKeys(
  auth: IamAuth,
  organizationId: string,
  appId: string,
  label: string,
  log: (msg: string) => void,
): Promise<void> {
  const apiKeys = await listApiKeys(auth, organizationId, appId);
  const byNewest = [...apiKeys].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  for (const stale of byNewest.slice(KEYS_TO_KEEP)) {
    await deleteApiKey(auth, stale.access_key);
    log(`  ~ pruned ${label} key ${stale.access_key}`);
  }
}

/**
 * Per-deploy credential mint (D3/REQ-7/REQ-10), run as CI under the conditioned IAMApplicationManager grant: key CRUD on exactly the service and boot apps, no app or policy creation.
 *  1. Mint a fresh boot-fetcher key (registry pull and handoff-read only, baked into cloud-init) and prune stale ones.
 *  2. Per service: mint a fresh service key, stage it as a SINGLE-ACCESS secret under /handoff/<service>/ so a VM whose read fails knows the bundle was
 *     intercepted and halts, then prune older handoff bundles and stale service keys.
 * The result JSON (boot pair plus handoff secret ids) goes to `outFile`, whose path the deploy passes to `pulumi up` via INFRA_GENERATION_KEYS_FILE.
 * Old keys survive one full deploy cycle (KEYS_TO_KEEP=2), so the outgoing generation keeps hydrating and signing until it is destroyed.
 */
export async function mintGenerationKeys(opts: MintGenerationKeysOptions): Promise<GenerationKeys> {
  const log = opts.log ?? ((msg: string) => console.info(msg));
  const auth: IamAuth = { secretKey: opts.callerSecretKey };
  const names = principalNames(opts.slug, opts.mode);
  const client = createSecretManagerClient({
    secretKey: opts.callerSecretKey,
    region: opts.region,
    projectId: opts.projectId,
  });

  // Resolve every app id first, so a missing principal fails before anything is minted or pruned.
  const bootAppId = await resolveAppId(auth, opts.organizationId, names.boot);
  const serviceAppIds = new Map<string, string>();
  for (const service of opts.services) {
    serviceAppIds.set(service, await resolveAppId(auth, opts.organizationId, names.vmService(service)));
  }

  // Mint and stage EVERYTHING first, prune keys LAST, so a failure mid-staging leaves every existing key intact and a retry re-mints from a working state.
  // Repeated failed attempts within one deploy can still age the live key out of the keep-newest-2 window.
  const bootKey = await mintKey(auth, opts.projectId, bootAppId, names.boot, opts.sha);
  log(`✓ minted boot key ${bootKey.access_key}`);

  const handoffSecretIds: Record<string, string> = {};
  for (const service of opts.services) {
    const appName = names.vmService(service);
    const appId = serviceAppIds.get(service);
    if (!appId) throw new Error(`mint-generation-keys: no app id resolved for ${appName}`);
    const serviceKey = await mintKey(auth, opts.projectId, appId, appName, opts.sha);

    // Prune older handoff bundles first: VMs cache the key after their single read, so an unconsumed bundle from a failed deploy is stale and would accumulate forever.
    const folder = handoffServicePath(opts.slug, opts.mode, service);
    for (const stale of await client.listSecretsUnder(folder)) {
      await client.deleteSecret(stale.id);
      log(`  ~ pruned stale handoff bundle ${stale.name}`);
    }

    const bundle = await client.ensureSecret({
      name: `handoff-${service}-${opts.sha.slice(0, 10)}`,
      path: folder,
      description: `Single-access service-key handoff for ${service} gen ${opts.sha.slice(0, 10)} (read once by the booting VM)`,
      ephemeralPolicy: { expires_once_accessed: true, action: 'disable' },
    });
    await client.putSecretValue({
      secretId: bundle.id,
      value: JSON.stringify({ accessKey: serviceKey.access_key, secretKey: serviceKey.secret_key }),
      description: 'Staged by mint-generation-keys',
    });
    handoffSecretIds[service] = bundle.id;
    log(`✓ staged handoff bundle for ${service} (${bundle.id})`);
  }

  // Every bundle is staged; only now retire stale keys.
  await pruneStaleKeys(auth, opts.organizationId, bootAppId, names.boot, log);
  for (const service of opts.services) {
    const appId = serviceAppIds.get(service);
    if (appId) await pruneStaleKeys(auth, opts.organizationId, appId, names.vmService(service), log);
  }

  const result: GenerationKeys = {
    bootAccessKey: bootKey.access_key,
    bootSecretKey: bootKey.secret_key,
    handoffSecretIds,
  };
  await writeFile(opts.outFile, JSON.stringify(result), { mode: 0o600 });
  return result;
}

// Standalone entry point.
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const sha = getFlag(argv, '--sha');
  const outFile = getFlag(argv, '--out');
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID;
  const organizationId = getFlag(argv, '--organization-id') ?? process.env.SCW_DEFAULT_ORGANIZATION_ID;
  if (!secretKey || !sha || !outFile || !projectId || !organizationId) {
    throw new Error(
      'Required: SCW_SECRET_KEY, --sha, --out, --project-id (or SCW_DEFAULT_PROJECT_ID), --organization-id (or SCW_DEFAULT_ORGANIZATION_ID)',
    );
  }
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  // VM-bearing services only (singleVM folds co-hosted/collocated into the host).
  const { deployedServices } = await import('../lib/services');
  const services = deployedServices(appConfig.services, appConfig.singleVM ?? false).map((svc) => svc.slug);
  await mintGenerationKeys({
    slug: appConfig.slug,
    mode: appConfig.mode,
    sha,
    region: appConfig.s3.region,
    projectId,
    organizationId,
    services,
    callerSecretKey: secretKey,
    outFile,
  });
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
