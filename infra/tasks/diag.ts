import { isMain } from '../lib/utils/is-main';
import { getFlag } from './args';
import {
  createAwsReader,
  emptyBootDiagGuidance,
  parseKeys,
  renderDiagnostics,
  selectDiagnostics,
  summarizeBundles,
} from './fetch-boot-diag';

interface ResolvedTarget {
  bucket: string;
  region: string;
  serviceNames: readonly string[];
  slug: string;
}

/** Derive bucket/region/service-list from appConfig for the given app mode. */
async function resolveTarget(mode: string): Promise<ResolvedTarget> {
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { deriveInfra } = await import('../lib/naming');
  const { serviceNames } = await import('../compose/compose');
  const { naming, region } = deriveInfra(appConfig);
  return { bucket: naming.bootDiagBucket, region, serviceNames, slug: appConfig.slug };
}

/** Render the `--list` overview as an aligned plain-text table. */
function printSummary(
  keys: string[],
  serviceNames: readonly string[],
  log: (msg: string) => void = console.info,
): void {
  const rows = summarizeBundles(keys, serviceNames);
  const pad = (s: string, n: number) => s.padEnd(n);
  log(`${pad('service', 12)}${pad('bundles', 9)}${pad('failures', 10)}latest full`);
  for (const r of rows) {
    log(`${pad(r.service, 12)}${pad(String(r.total), 9)}${pad(String(r.failures), 10)}${r.latestFull ?? '\u2014'}`);
  }
}

/** Amz-style stamp (YYYYMMDDTHHMMSSZ) parsed from a boot-diag key, for --since filtering. */
export function keyStampIso(key: string): string | undefined {
  const match = key.match(/(\d{8}T\d{6}Z)/);
  if (!match?.[1]) return undefined;
  const s = match[1];
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(9, 11)}:${s.slice(11, 13)}:${s.slice(13, 15)}Z`;
}

/** Re-ship black-box event JSONL to the configured OTLP backend (post-hoc replay). */
async function replayEvents(
  keys: string[],
  services: readonly string[],
  reader: { cat(key: string): string },
  sinceIso?: string,
): Promise<void> {
  const { otlpConfigFromEnv } = await import('../lib/telemetry/emitter');
  const { logsPayload } = await import('../lib/telemetry/otlp');
  const { telemetrySink } = await import('../config/telemetry.config');
  const config = otlpConfigFromEnv();
  if (!config)
    throw new Error(
      `diag --replay needs an OTLP target: set OTEL_EXPORTER_OTLP_ENDPOINT or ${telemetrySink.keyEnvVar}`,
    );
  const eventKeys = keys.filter((key) => {
    if (!key.endsWith('-events.jsonl') || !services.some((service) => key.includes(`/${service}-`))) return false;
    if (!sinceIso) return true;
    const stamp = keyStampIso(key);
    return stamp !== undefined && stamp >= sinceIso;
  });
  if (eventKeys.length === 0) {
    console.info('[diag] no black-box event bundles to replay');
    return;
  }
  for (const key of eventKeys) {
    const records = reader
      .cat(key)
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

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const mode = getFlag(argv, '--mode') ?? process.env.APP_MODE ?? 'production';
  const only = getFlag(argv, '--service');
  const wantList = argv.includes('--list');
  const wantReplay = argv.includes('--replay');
  const sinceIso = getFlag(argv, '--since');

  const target = await resolveTarget(mode);
  const bucket = getFlag(argv, '--bucket') ?? target.bucket;
  const region = getFlag(argv, '--region') ?? target.region;
  const services = only ? [only] : target.serviceNames;

  const reader = createAwsReader(`https://s3.${region}.scw.cloud`, bucket);
  // A list failure (missing aws CLI, bad creds, wrong bucket) throws here with a
  // clear message when the service slug is invalid.
  const keys = parseKeys(reader.list());

  if (keys.length === 0 && !wantReplay) {
    for (const line of emptyBootDiagGuidance(target.slug)) console.info(`[diag] ${line}`);
    return;
  }

  if (wantList) {
    printSummary(keys, services);
    return;
  }

  if (wantReplay) {
    await replayEvents(keys, services, reader, sinceIso);
    return;
  }

  const style = process.env.GITHUB_ACTIONS === 'true' ? 'ci' : 'plain';
  for (const service of services) {
    renderDiagnostics(service, selectDiagnostics(keys, service), reader, console.info, style);
  }
}

if (isMain(import.meta.url)) await main();
