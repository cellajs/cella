import type { ServiceName } from '../compose/compose';
import { runtimeSecrets } from '../lib/runtime-secrets';
import { secretCopies } from '../lib/scaleway/secret-paths';
import { serviceNames } from '../lib/services';
import { type FetchLike, resolveFetch } from '../lib/utils/fetch-like';
import { runIfMain } from '../lib/utils/is-main';
import { parseJsonBody } from '../lib/utils/json';
import { parseServiceRows } from '../lib/utils/service-rows';
import { getFlag } from './args';

const SECRET_BASE = 'https://api.scaleway.com/secret-manager/v1beta1';

/** A runtime secret to probe, in the shape the VM manifest would carry. */
export interface SecretToCheck {
  envVar: string;
  secretName: string;
  required: boolean;
  /** The folder of the copy to probe: a secret of several consumers has one copy in each one's folder. */
  path?: string;
}

export interface DeliverabilityOffender {
  envVar: string;
  secretName: string;
  path?: string;
  /** A required copy with no version: the machine reading it would stop at hydration. */
  reason: 'missing';
}

export interface AssertSecretsDeliverableResult {
  ok: boolean;
  checked: number;
  offenders: DeliverabilityOffender[];
}

export interface AssertSecretsDeliverableOptions {
  secretKey: string;
  region: string;
  projectId: string;
  /** Secrets to probe. Defaults to the runtime-secrets registry. */
  secrets: SecretToCheck[];
  /** Injected for tests; defaults to global fetch. */
  fetchImpl?: FetchLike;
  /** Injected for tests; defaults to console.info. */
  log?: (msg: string) => void;
}

const trimSlashes = (path: string) => `/${path.split('/').filter(Boolean).join('/')}`;

/** How many versions a secret holds, from its name and, when one is given, its folder (copies share a name); 0 when absent. Metadata only. */
async function versionCount(
  fetchImpl: FetchLike,
  secretKey: string,
  region: string,
  projectId: string,
  name: string,
  path?: string,
): Promise<number> {
  const url = `${SECRET_BASE}/regions/${region}/secrets?project_id=${projectId}&name=${encodeURIComponent(name)}&page_size=50`;
  const res = await fetchImpl(url, { method: 'GET', headers: { 'X-Auth-Token': secretKey } });
  const body = await res.text();
  if (!res.ok) throw new Error(`Secret Manager list '${name}' → ${res.status}: ${body}`);
  const { secrets = [] } = parseJsonBody<{ secrets?: Array<{ name: string; path?: string; version_count?: number }> }>(body);
  const found = secrets.find((s) => s.name === name && (path === undefined || trimSlashes(s.path ?? '') === trimSlashes(path)));
  return found?.version_count ?? 0;
}

/**
 * Check from metadata that every required copy a machine reads holds a version, without reading a value: the deploy key reads no value of
 * the app's. A value's form (a single line) is checked where it is written. Pure over the injected `fetchImpl`.
 */
export async function assertSecretsDeliverable(opts: AssertSecretsDeliverableOptions): Promise<AssertSecretsDeliverableResult> {
  const fetchImpl = resolveFetch(opts.fetchImpl);
  const log = opts.log ?? ((msg) => console.info(msg));
  const offenders: DeliverabilityOffender[] = [];

  for (const secret of opts.secrets) {
    if (!secret.required) continue;
    const versions = await versionCount(fetchImpl, opts.secretKey, opts.region, opts.projectId, secret.secretName, secret.path);
    if (versions === 0)
      offenders.push({ envVar: secret.envVar, secretName: secret.secretName, ...(secret.path ? { path: secret.path } : {}), reason: 'missing' });
  }

  const ok = offenders.length === 0;
  if (ok) {
    log(`✓ Runtime secrets deliverable: every required copy of the ${opts.secrets.length} probed holds a value`);
  } else {
    log(`✗ Runtime secrets NOT deliverable: ${offenders.map((o) => `${o.envVar} (${o.reason})`).join(', ')}`);
  }
  return { ok, checked: opts.secrets.length, offenders };
}

/**
 * Build the probe list from the runtime-secrets registry: the copy of every enabled consumer, so an optional secret for a disabled service
 * (e.g. ai) never produces a false failure, and a copy left empty fails as the machine reading it would.
 */
export function secretsForServices(enabled: readonly ServiceName[], slug: string, mode: string): SecretToCheck[] {
  const enabledSet = new Set<string>(enabled);
  return runtimeSecrets.flatMap((secret) =>
    secretCopies(secret, slug, mode)
      .filter((copy) => enabledSet.has(copy.service))
      .map((copy) => ({ envVar: secret.envVar, secretName: secret.secretName, required: secret.required, path: copy.path })),
  );
}

export function serviceNamesFromServicesJson(raw: string): ServiceName[] {
  return parseServiceRows(raw, '--services-json', { required: ['service'] })
    .map((row) => row.service)
    .filter((service): service is ServiceName => (serviceNames as readonly string[]).includes(service));
}

// Standalone entry point.
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const region = getFlag(argv, '--region') ?? process.env.REGION;
  const projectId = getFlag(argv, '--project-id') ?? process.env.SCW_DEFAULT_PROJECT_ID;
  const servicesJson = getFlag(argv, '--services-json');
  const servicesArg = getFlag(argv, '--services');
  const requested = servicesJson ? serviceNamesFromServicesJson(servicesJson) : servicesArg ? servicesArg.split(',') : serviceNames;
  const enabled = requested.map((s) => s.trim()).filter((s): s is ServiceName => (serviceNames as readonly string[]).includes(s));

  const mode = getFlag(argv, '--mode');
  if (!secretKey || !region || !projectId || !mode) throw new Error('Required: SCW_SECRET_KEY, --region, --project-id, --mode');
  // The copies' folders carry the app's slug, which the engine config of the mode names.
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const { slug } = await loadEngineConfig();

  const secrets = secretsForServices(enabled, slug, mode);
  const result = await assertSecretsDeliverable({ secretKey, region, projectId, secrets });
  if (!result.ok) {
    throw new Error(
      `Undeliverable runtime secrets: ${result.offenders.map((o) => `${o.envVar} [${o.secretName}${o.path ? ` in ${o.path}` : ''}] (${o.reason})`).join(', ')}. ` +
        'A missing required value is made by an apply (generated, database) or set in "Manage runtime secrets" (operator) before the roll.',
    );
  }
}

runIfMain(import.meta.url, main);
