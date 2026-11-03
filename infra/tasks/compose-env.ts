import { writeFile } from 'node:fs/promises';
import type { EngineConfig } from '../config/engine-config';
import { BOOT_ACCOUNTS_PREFIX } from '../lib/deploy/boot-accounts';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { envObjectKey, releaseMachine } from '../lib/deploy/release-archives';
import { deriveInfra } from '../lib/naming';
import { actionCommand } from '../lib/operator-actions';
import { type RuntimeEnvEntry, runtimeEnvEntries } from '../lib/runtime-secrets';
import { deployS3Key, makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { createSecretManagerClient } from '../lib/scaleway/scaleway-secret-manager';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';
import { carriedServices, deployedServices } from '../lib/services';
import { isEnvFileDeliverable } from '../lib/utils/env-file';
import { ExitCodeError } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/** One machine's env file of a release: the env object it is written to and the boot account key its machine uploads to. */
export interface MachineEnv {
  service: string;
  /** Key of the env object in the boot-diag bucket, and the version written, which the deploy deletes once the machine booted. */
  env: string;
  envVersion?: string;
  bootAccount: string;
}

/** The names each machine of an environment carries in its env file: its own service's, and on the singleVM host those of every service it carries. */
export function machineEnvEntries(appConfig: Pick<EngineConfig, 'services' | 'singleVM'>): Array<{ service: string; entries: RuntimeEnvEntry[] }> {
  return deployedServices(appConfig.services, appConfig.singleVM).map((machine) => ({
    service: machine.slug,
    entries: runtimeEnvEntries(carriedServices(appConfig.services, appConfig.singleVM, machine)),
  }));
}

/**
 * Compose each machine's env file from the runtime values, one `NAME=value` line per name it carries. A required name without a value, or a
 * value that is not one line, ends the deploy blocked before any machine exists: the operator stores it, which starts the target again.
 * @throws ExitCodeError with the blocked exit code, naming every value owed
 */
export function composeMachineEnvs(
  machines: ReadonlyArray<{ service: string; entries: readonly RuntimeEnvEntry[] }>,
  values: ReadonlyMap<string, string>,
): Record<string, string> {
  const missing = new Set<string>();
  const malformed = new Set<string>();
  const files: Record<string, string> = {};
  for (const { service, entries } of machines) {
    const lines: string[] = [];
    for (const entry of entries) {
      const value = values.get(entry.secretName);
      if (value === undefined || value === '') {
        if (entry.required) missing.add(`${entry.envVar} [${entry.secretName}]`);
        continue;
      }
      if (!isEnvFileDeliverable(value).ok) malformed.add(`${entry.envVar} [${entry.secretName}]`);
      else lines.push(`${entry.envVar}=${value}`);
    }
    files[service] = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  }
  if (missing.size > 0 || malformed.size > 0) {
    const owed = [
      ...(missing.size > 0 ? [`required runtime values are not set: ${[...missing].join(', ')}`] : []),
      ...(malformed.size > 0 ? [`values are not one line: ${[...malformed].join(', ')}`] : []),
    ];
    throw new ExitCodeError(
      `Blocked: ${owed.join('; ')}. Store an operator value with \`${actionCommand('secrets')}\`, which starts this target again; a generated or database value is made by \`${actionCommand('apply')}\`, the uploads key by \`${actionCommand('identity')}\`.`,
      MAIN_JOB_EXIT.blocked,
    );
  }
  return files;
}

/** A boot account's key, the time it is named at in the form the readers sort by (lib/deploy/boot-accounts.ts). */
function bootAccountKey(service: string, now: Date): string {
  const stamp = now
    .toISOString()
    .replace(/[:-]/g, '')
    .replace(/\.\d{3}Z$/, 'Z');
  return `${BOOT_ACCOUNTS_PREFIX}${service}-${stamp}-boot.log`;
}

/**
 * The deploy's step before the build: read the runtime values with the deploy key, compose each machine's env file and write it to the
 * boot-diag bucket under `env/`, where only the deploy key reads it. Writes the env objects and boot account keys to `--out`, from which the
 * deploy hands each new machine its links.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const sha = getFlag(argv, '--sha');
  const projectId = getFlag(argv, '--project-id');
  const out = getFlag(argv, '--out');
  const { accessKey, secretKey } = deployS3Key();
  if (!sha || !projectId || !out || !secretKey) throw new Error('Required: SCW_SECRET_KEY, --sha, --project-id, --out');
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  const { naming, region } = deriveInfra(appConfig);
  const machines = machineEnvEntries(appConfig);

  const secrets = createSecretManagerClient({ secretKey, region, projectId });
  const listed = await secrets.listSecretsUnder(RUNTIME_FOLDER);
  const needed = new Set(machines.flatMap((machine) => machine.entries.map((entry) => entry.secretName)));
  const values = new Map<string, string>();
  for (const container of listed.filter((secret) => needed.has(secret.name) && (secret.version_count ?? 0) > 0)) {
    values.set(container.name, await secrets.accessLatestValue(container.id));
  }
  const files = composeMachineEnvs(machines, values);

  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await makeS3Client(region, projectAccessKey(accessKey, projectId), secretKey);
  const now = new Date();
  const written: MachineEnv[] = [];
  for (const { service } of machines) {
    const key = envObjectKey(releaseMachine(service, sha));
    const put = await s3.send(
      new PutObjectCommand({ Bucket: naming.bootDiagBucket, Key: key, Body: files[service] ?? '', ContentType: 'text/plain' }),
    );
    written.push({ service, env: key, ...(put.VersionId ? { envVersion: put.VersionId } : {}), bootAccount: bootAccountKey(service, now) });
    console.info(`[compose-env] ${service}: ${key}`);
  }
  await writeFile(out, JSON.stringify(written, null, 2), { mode: 0o600 });
}

runIfMain(import.meta.url, main);
