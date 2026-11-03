import { readFile } from 'node:fs/promises';
import type { GenerationMetadata } from '../lib/generation-metadata';
import { deriveInfra } from '../lib/naming';
import { withoutLinks } from '../lib/scaleway/presign';
import { deployS3Key, makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { errorMessage } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';
import type { MachineEnv } from './compose-env';

/** What clearing a release's links does outside this module, so a test passes its own. */
export interface ClearLinksEffects {
  /** The release's machines of a service, by server id. */
  machines(service: string): Promise<string[]>;
  /** True once the machine's boot account is in the bucket. */
  accountArrived(key: string): Promise<boolean>;
  userData(serverId: string): Promise<string>;
  setUserData(serverId: string, text: string): Promise<void>;
  /** Delete the env file with its version, so no copy of the machine's values stays in the bucket. */
  deleteEnv(env: MachineEnv): Promise<void>;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}

/**
 * Take the links out of each new machine's user data once its boot account arrived, and delete its env file: the machine fetched what it
 * needs, and the metadata service then serves its plan and nothing that fetches or writes. With `waitMs` 0, as at the end of a run, it waits
 * for no account. A machine that is gone, a user data that cannot be read, an env file already deleted is said and passed over. Returns the
 * services cleared.
 */
export async function clearMachineLinks(
  envs: readonly MachineEnv[],
  fx: ClearLinksEffects,
  opts: { waitMs: number; pollMs?: number },
): Promise<string[]> {
  const cleared: string[] = [];
  const deadline = Date.now() + opts.waitMs;
  for (const env of envs) {
    while (opts.waitMs > 0 && Date.now() < deadline && !(await fx.accountArrived(env.bootAccount).catch(() => false))) {
      await fx.sleep(opts.pollMs ?? 5_000);
    }
    for (const serverId of await fx.machines(env.service).catch(() => [])) {
      try {
        const text = await fx.userData(serverId);
        const stripped = withoutLinks(text);
        if (stripped !== text) await fx.setUserData(serverId, stripped);
      } catch (error) {
        fx.log(`[links] ${env.service}: the user data of ${serverId} kept its links (${errorMessage(error)}); they end by themselves`);
      }
    }
    await fx.deleteEnv(env).catch((error) => fx.log(`[links] ${env.service}: ${env.env} stays until the bucket's rule (${errorMessage(error)})`));
    cleared.push(env.service);
  }
  return cleared;
}

/**
 * The deploy's step after the rollout, and its last act: `--envs` the compose step's output, `--stack` whose generations name the machines,
 * `--sha` the release. `--no-wait` at the end of a run, where a machine that never reported loses its links all the same.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const stack = getFlag(argv, '--stack');
  const sha = getFlag(argv, '--sha');
  const envsFile = getFlag(argv, '--envs');
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID;
  const { accessKey, secretKey } = deployS3Key();
  if (!stack || !sha || !envsFile || !projectId || !secretKey)
    throw new Error('Required: SCW_SECRET_KEY, SCW_DEFAULT_PROJECT_ID, --stack, --sha, --envs');
  const envs = JSON.parse(await readFile(envsFile, 'utf8')) as MachineEnv[];
  const { loadEngineConfig } = await import('../config/engine-config');
  const { naming, region, zone } = deriveInfra(await loadEngineConfig());
  const { DeleteObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const { createPulumiDriver } = await import('../lib/stack/pulumi-driver');
  const s3 = await makeS3Client(region, projectAccessKey(accessKey, projectId), secretKey);
  const instance = `https://api.scaleway.com/instance/v1/zones/${zone}/servers`;
  let generations: Promise<GenerationMetadata[]> | undefined;
  const call = async (method: string, url: string, body?: string) => {
    const res = await fetch(url, { method, headers: { 'X-Auth-Token': secretKey, 'Content-Type': 'text/plain' }, body });
    if (!res.ok) throw new Error(`${method} ${url} → ${res.status}`);
    return res.text();
  };
  await clearMachineLinks(
    envs,
    {
      machines: async (service) => {
        generations ??= createPulumiDriver(stack).output<GenerationMetadata[]>('computeGenerationMetadata');
        return (await generations).filter((gen) => gen.service === service && gen.sha === sha).map((gen) => gen.serverId);
      },
      accountArrived: (key) =>
        s3.send(new HeadObjectCommand({ Bucket: naming.bootDiagBucket, Key: key })).then(
          () => true,
          () => false,
        ),
      userData: (serverId) => call('GET', `${instance}/${serverId}/user_data/cloud-init`),
      setUserData: async (serverId, text) => {
        await call('PATCH', `${instance}/${serverId}/user_data/cloud-init`, text);
      },
      // A version an earlier attempt deleted is gone as asked.
      deleteEnv: async (env) => {
        const version = env.envVersion ? { VersionId: env.envVersion } : {};
        await s3.send(new DeleteObjectCommand({ Bucket: naming.bootDiagBucket, Key: env.env, ...version })).catch((error: unknown) => {
          if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) throw error;
        });
      },
      sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
      log: (message) => console.info(message),
    },
    { waitMs: argv.includes('--no-wait') ? 0 : 3 * 60_000 },
  );
}

runIfMain(import.meta.url, main);
