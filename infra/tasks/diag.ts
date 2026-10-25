import { accountFailed, type BootAccountReader, bucketBootAccountReader, releaseAccounts, serviceAccountKeys } from '../lib/deploy/boot-accounts';
import { deployS3Key, makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { observerKeyInModeFile, ownProjectId } from '../lib/utils/env-files';
import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';

interface ResolvedTarget {
  bucket: string;
  region: string;
  serviceNames: readonly string[];
  slug: string;
}

/** Derive bucket/region/service-list from appConfig for the given app mode. Only services that boot a VM of their own upload bundles: under singleVM, the host alone. */
export async function diagTarget(mode: string): Promise<ResolvedTarget> {
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { deriveInfra } = await import('../lib/naming');
  const { deployedServices } = await import('../lib/services');
  const { naming, region } = deriveInfra(appConfig);
  const serviceNames = deployedServices(appConfig.services, appConfig.singleVM).map((service) => service.slug);
  return { bucket: naming.bootDiagBucket, region, serviceNames, slug: appConfig.slug };
}

/**
 * A reader of the environment's boot accounts: with the deploy key inside a run (`SCW_ACCESS_KEY`), else with this machine's observer key
 * and the environment's project from `infra/.env.<mode>`.
 */
export async function bootAccountReader(target: Pick<ResolvedTarget, 'bucket' | 'region'>, mode: string): Promise<BootAccountReader> {
  const deploy = deployS3Key();
  const observer = observerKeyInModeFile(mode);
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID ?? ownProjectId(mode);
  const key = deploy.accessKey ? deploy : observer;
  if (!key?.accessKey || !projectId) throw new Error(`diag reads with the observer key and the project of infra/.env.${mode}, and found neither`);
  const s3 = await makeS3Client(target.region, projectAccessKey(key.accessKey, projectId), key.secretKey);
  return bucketBootAccountReader(s3, target.bucket);
}

/** Amz-style stamp (YYYYMMDDTHHMMSSZ) parsed from a boot-diag key, for --since filtering. */
export function keyStampIso(key: string): string | undefined {
  const match = key.match(/(\d{8}T\d{6}Z)/);
  if (!match?.[1]) return undefined;
  const s = match[1];
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}

/**
 * Event bundles to replay: the services' `-events.jsonl` keys, stamped at or after `sinceIso` and, with `bootLogKeys`, only those
 * uploaded beside one of these boot transcripts (a release's own, see `releaseAccounts`).
 */
export function selectEventKeys(keys: string[], services: readonly string[], opts: { sinceIso?: string; bootLogKeys?: string[] } = {}): string[] {
  const stems = opts.bootLogKeys ? new Set(opts.bootLogKeys.map((key) => key.replace(/-boot\.log$/, ''))) : undefined;
  return keys.filter((key) => {
    if (!key.endsWith('-events.jsonl') || !services.some((service) => key.startsWith(`${service}-`))) return false;
    if (stems && !stems.has(key.replace(/-events\.jsonl$/, ''))) return false;
    if (!opts.sinceIso) return true;
    const stamp = keyStampIso(key);
    return stamp !== undefined && stamp >= opts.sinceIso;
  });
}

/** Re-ship black-box event JSONL to the configured OTLP backend (post-hoc replay). */
export async function replayEvents(reader: BootAccountReader, services: readonly string[], opts: { sinceIso?: string; sha?: string }): Promise<void> {
  const { otlpConfigFromEnv } = await import('../lib/telemetry/emitter');
  const { logsPayload } = await import('../lib/telemetry/otlp');
  const { telemetrySink } = await import('../config/telemetry.config');
  const config = otlpConfigFromEnv();
  if (!config) throw new Error(`diag --replay needs an OTLP target: set OTEL_EXPORTER_OTLP_ENDPOINT or ${telemetrySink.keyEnvVar}`);
  const keys = await reader.list();
  const bootLogKeys = opts.sha
    ? (await releaseAccounts(reader, services, opts.sha)).flatMap((found) => (found.account ? [found.account.key] : []))
    : undefined;
  const eventKeys = selectEventKeys(keys, services, { sinceIso: opts.sinceIso, bootLogKeys });
  if (eventKeys.length === 0) {
    console.info('[diag] no black-box event bundles to replay');
    return;
  }
  for (const key of eventKeys) {
    const records = (await reader.read(key))
      .split('\n')
      .filter((line) => line.trim())
      .map((line) => JSON.parse(line));
    const res = await fetch(`${config.endpoint}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...config.headers },
      body: JSON.stringify(logsPayload({ 'service.name': 'infra-boot' }, records)),
    });
    if (!res.ok) throw new Error(`replay ${key} -> ${res.status}: ${(await res.text()).slice(0, 200)}`);
    console.info(`[diag] replayed ${records.length} event(s) from ${key}`);
  }
}

/**
 * A person's view of an environment's boot accounts (`pnpm --filter infra diag`): `--sha <sha>` prints each service's account of that
 * release, or says it has none; without it, each service's newest; `--list` counts them; `--replay` re-ships their events to telemetry.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const mode = getFlag(argv, '--mode') ?? process.env.APP_MODE ?? 'production';
  const only = getFlag(argv, '--service');
  // The release whose accounts to show; abbreviated SHAs work, but too short a prefix would match every release.
  const sha = getFlag(argv, '--sha');
  if (sha !== undefined && !/^[0-9a-f]{7,40}$/.test(sha)) throw new Error(`diag --sha takes a git SHA of 7 to 40 hex characters, got '${sha}'`);

  const target = await diagTarget(mode);
  const services = only ? [only] : target.serviceNames;
  const reader = await bootAccountReader(target, mode);

  if (argv.includes('--replay')) return replayEvents(reader, services, { sinceIso: getFlag(argv, '--since'), sha });

  const keys = await reader.list();
  if (keys.length === 0) {
    console.info(
      `[diag] No machine has uploaded a boot account to ${target.bucket}, though every boot uploads one: the boot runner never ran. Read the machine's serial console in the Scaleway console (::${target.slug}:: markers, "BOOT FAILED (exit N)").`,
    );
    return;
  }

  if (argv.includes('--list')) {
    for (const service of services) {
      const owned = serviceAccountKeys(keys, service);
      console.info(`${service.padEnd(12)}${String(owned.length).padEnd(6)}${owned[0] ?? 'no account'}`);
    }
    return;
  }

  if (sha) {
    for (const found of await releaseAccounts(reader, services, sha)) {
      if (!found.account) {
        console.info(
          `! ${found.service}: no account of ${sha.slice(0, 7)}: its boot runner has not finished (still running, stuck before its upload, or never started)`,
        );
        if (found.newestOther)
          console.info(`  newest is ${found.newestOther.key}, of ${found.newestOther.release?.slice(0, 7) ?? 'an unknown release'}: not shown`);
        continue;
      }
      console.info(`\n=== ${found.service} (${found.account.key})${found.account.failed ? ': boot failed' : ''} ===`);
      console.info(found.account.body);
    }
    return;
  }

  for (const service of services) {
    const [newest] = serviceAccountKeys(keys, service);
    if (!newest) {
      console.info(`! ${service}: no account was ever uploaded`);
      continue;
    }
    const body = await reader.read(newest);
    console.info(`\n=== ${service} (${newest})${accountFailed(body) ? ': boot failed' : ''} ===`);
    console.info(body);
  }
}

if (isMain(import.meta.url)) await main();
