import { readFile } from 'node:fs/promises';
import { deriveInfra } from '../lib/naming';
import { getUserData, setUserData } from '../lib/scaleway/machines';
import { withoutLinks } from '../lib/scaleway/presign';
import { deployS3Key, makeS3Client, projectAccessKey } from '../lib/scaleway/s3-client';
import { errorMessage } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';
import type { MachineEnv } from './compose-env';

/** A machine a deploy made, by its role; `kept` when a failed stop-first switch left it, as a late boot may still serve. */
export interface MadeMachine {
  role: string;
  machine: string;
  kept?: boolean;
}

/** What clearing a release's links does outside this module, so a test passes its own. */
export interface ClearLinksEffects {
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
 * Take the links out of each new machine's cloud-init once its boot account arrived, and delete every env file of the run: the machine
 * fetched what it needs, and the metadata service then serves its plan and manifest and nothing that fetches or writes. With `waitMs` 0, as
 * at the end of a run, it waits for no account. A kept machine keeps both, as its boot may still fetch them: its links end within minutes
 * and its env file goes by the bucket's rule within a day. A machine that is gone, a user data that cannot be read, an env file already
 * deleted is said and passed over. Returns the roles cleared.
 */
export async function clearMachineLinks(
  envs: readonly MachineEnv[],
  machines: readonly MadeMachine[],
  fx: ClearLinksEffects,
  opts: { waitMs: number; pollMs?: number },
): Promise<string[]> {
  const cleared: string[] = [];
  const deadline = Date.now() + opts.waitMs;
  for (const env of envs) {
    if (machines.some((entry) => entry.role === env.service && entry.kept)) {
      fx.log(`[links] ${env.service}: its machine was kept for its boot, so its links and ${env.env} stay until they end`);
      continue;
    }
    const made = machines.filter((entry) => entry.role === env.service);
    while (made.length > 0 && opts.waitMs > 0 && Date.now() < deadline && !(await fx.accountArrived(env.bootAccount).catch(() => false))) {
      await fx.sleep(opts.pollMs ?? 5_000);
    }
    for (const { machine } of made) {
      try {
        const text = await fx.userData(machine);
        const stripped = withoutLinks(text);
        if (stripped !== text) await fx.setUserData(machine, stripped);
      } catch (error) {
        fx.log(`[links] ${env.service}: the user data of ${machine} kept its links (${errorMessage(error)}); they end by themselves`);
      }
    }
    await fx.deleteEnv(env).catch((error) => fx.log(`[links] ${env.service}: ${env.env} stays until the bucket's rule (${errorMessage(error)})`));
    cleared.push(env.service);
  }
  return cleared;
}

/**
 * The deploy's step after the switches, and its last act: `--envs` the compose step's output, `--machines` the machines the switches made.
 * `--no-wait` at the end of a run, where a machine that never reported loses its links all the same.
 */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const envsFile = getFlag(argv, '--envs');
  const machinesFile = getFlag(argv, '--machines');
  const projectId = process.env.SCW_DEFAULT_PROJECT_ID;
  const { accessKey, secretKey } = deployS3Key();
  if (!envsFile || !machinesFile || !projectId || !secretKey) throw new Error('Required: SCW_SECRET_KEY, SCW_DEFAULT_PROJECT_ID, --envs, --machines');
  const envs = JSON.parse(await readFile(envsFile, 'utf8')) as MachineEnv[];
  const machines = JSON.parse(await readFile(machinesFile, 'utf8').catch(() => '[]')) as MadeMachine[];
  const { engineConfig } = await import('../config/engine-config');
  const { naming, region, zone } = deriveInfra(engineConfig);
  const { DeleteObjectCommand, HeadObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = await makeS3Client(region, projectAccessKey(accessKey, projectId), secretKey);
  const auth = { secretKey };
  await clearMachineLinks(
    envs,
    machines,
    {
      accountArrived: (key) =>
        s3.send(new HeadObjectCommand({ Bucket: naming.bootDiagBucket, Key: key })).then(
          () => true,
          () => false,
        ),
      userData: (serverId) => getUserData(auth, zone, serverId, 'cloud-init'),
      setUserData: (serverId, text) => setUserData(auth, zone, serverId, 'cloud-init', text),
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
