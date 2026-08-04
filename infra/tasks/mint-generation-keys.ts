import { writeFile } from 'node:fs/promises';
import { principalNames } from '../lib/scaleway/principals';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { scwFetch, scwSend } from '../lib/scaleway/scw-fetch';
import { handoffServicePath } from '../lib/scaleway/vm-reader-secret';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

const IAM_BASE = 'https://api.scaleway.com/iam/v1alpha1';

/**
 * How many API keys each service/boot app retains after a mint: the fresh key
 * plus the previous generation's (blue-green overlap AND the presigned-URL
 * floor). URLs signed by the outgoing backend generation stay valid until the
 * key created two deploys ago is pruned, i.e. at least one full deploy cycle.
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

interface ScwApiKey {
  access_key: string;
  secret_key: string;
  created_at?: string;
}

async function resolveAppId(secretKey: string, organizationId: string, name: string): Promise<string> {
  const { applications = [] } = await scwFetch<{ applications?: Array<{ id: string; name: string }> }>(
    { secretKey },
    'GET',
    `${IAM_BASE}/applications?name=${encodeURIComponent(name)}&organization_id=${organizationId}&page_size=20`,
  );
  const app = applications.find((a) => a.name === name);
  if (!app)
    throw new Error(
      `mint-generation-keys: IAM application '${name}' not found — run the infra CLI "Migrate IAM model" / bootstrap first.`,
    );
  return app.id;
}

/** Mint a fresh key on the app, then prune all but the newest KEYS_TO_KEEP. */
async function mintAndPrune(
  secretKey: string,
  organizationId: string,
  projectId: string,
  appId: string,
  label: string,
  sha: string,
  log: (msg: string) => void,
): Promise<ScwApiKey> {
  const fresh = await scwFetch<ScwApiKey>({ secretKey }, 'POST', `${IAM_BASE}/api-keys`, {
    application_id: appId,
    description: `${label} gen ${sha.slice(0, 10)}`,
    default_project_id: projectId,
  });
  const { api_keys = [] } = await scwFetch<{ api_keys?: ScwApiKey[] }>(
    { secretKey },
    'GET',
    `${IAM_BASE}/api-keys?application_id=${appId}&organization_id=${organizationId}&page_size=100`,
  );
  const byNewest = [...api_keys].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  for (const stale of byNewest.slice(KEYS_TO_KEEP)) {
    await scwSend({ secretKey }, 'DELETE', `${IAM_BASE}/api-keys/${stale.access_key}`);
    log(`  ~ pruned ${label} key ${stale.access_key}`);
  }
  return fresh;
}

/**
 * Per-deploy credential mint (D3/REQ-7/REQ-10). Runs as CI, allowed by the
 * conditioned IAMApplicationManager grant (key CRUD on exactly the service +
 * boot apps; creating apps/policies stays denied).
 *
 *  1. Mint a fresh boot-fetcher key (baked into cloud-init; registry pull +
 *     handoff-read only) and prune stale ones.
 *  2. Per service: mint a fresh service key, stage it as a SINGLE-ACCESS
 *     secret under /handoff/<service>/ (first read disables the version, so a
 *     VM whose read fails knows the bundle was intercepted and halts), prune
 *     older handoff bundles, prune stale service keys.
 *
 * The result JSON (boot pair + handoff secret ids) goes to `outFile`; the
 * deploy passes its path to `pulumi up` via INFRA_GENERATION_KEYS_FILE.
 * Old keys survive one full deploy cycle (KEYS_TO_KEEP=2): the outgoing
 * generation keeps hydrating/signing until it is destroyed.
 */
export async function mintGenerationKeys(opts: MintGenerationKeysOptions): Promise<GenerationKeys> {
  const log = opts.log ?? ((msg: string) => console.info(msg));
  const names = principalNames(opts.slug, opts.mode);
  const client = createSecretManagerClient({
    secretKey: opts.callerSecretKey,
    region: opts.region,
    projectId: opts.projectId,
  });

  const bootAppId = await resolveAppId(opts.callerSecretKey, opts.organizationId, names.boot);
  const bootKey = await mintAndPrune(
    opts.callerSecretKey,
    opts.organizationId,
    opts.projectId,
    bootAppId,
    names.boot,
    opts.sha,
    log,
  );
  log(`✓ minted boot key ${bootKey.access_key}`);

  const handoffSecretIds: Record<string, string> = {};
  for (const service of opts.services) {
    const appName = names.vmService(service);
    const appId = await resolveAppId(opts.callerSecretKey, opts.organizationId, appName);
    const serviceKey = await mintAndPrune(
      opts.callerSecretKey,
      opts.organizationId,
      opts.projectId,
      appId,
      appName,
      opts.sha,
      log,
    );

    // Prune older handoff bundles first: an unconsumed bundle from a failed
    // deploy is stale (VMs cache the key after their single read), and leaving
    // it would accumulate disabled/unread versions forever.
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
