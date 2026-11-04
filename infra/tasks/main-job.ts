import { spawnSync } from 'node:child_process';
import { type EngineStamp, readEngineStamp } from '../lib/deploy/applied-engine';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { COMMIT, defaultRule, isReleaseCommit, type RemoteRef } from '../lib/deploy/target';
import { errorMessage } from '../lib/utils/errors';
import { isRecord } from '../lib/utils/guards';
import { isMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';

/** Run one infra task to its end with the env given, its output in the run's log; resolves to its exit code. */
export type RunTask = (script: string, args: string[], env: NodeJS.ProcessEnv) => number;

/** What a run reads outside its own values. */
export interface MainJobEffects {
  /** The stamp of the engine image the run started from (lib/deploy/applied-engine.ts); undefined outside one. */
  stamp(): EngineStamp | undefined;
  /** The repository's release tags as `git ls-remote` lists them, with the repository read key a private repository needs. */
  releaseRefs(opts: { mode: string; key: DeployKey; projectId: string }): Promise<RemoteRef[]>;
  run: RunTask;
}

interface DeployKey {
  accessKey: string;
  secretKey: string;
}

/** The deploy key as the definition hands it: the engine folder's copy in `DEPLOY_KEY_JSON`, or `SCW_*` from a definition before the engine image. */
function deployKey(env: NodeJS.ProcessEnv): DeployKey | undefined {
  if (env.DEPLOY_KEY_JSON) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(env.DEPLOY_KEY_JSON);
    } catch {
      // JSON.parse quotes the text it refuses, which is the key.
      return undefined;
    }
    if (!isRecord(parsed)) return undefined;
    const { accessKey, secretKey } = parsed;
    return typeof accessKey === 'string' && accessKey && typeof secretKey === 'string' && secretKey ? { accessKey, secretKey } : undefined;
  }
  return env.SCW_ACCESS_KEY && env.SCW_SECRET_KEY ? { accessKey: env.SCW_ACCESS_KEY, secretKey: env.SCW_SECRET_KEY } : undefined;
}

/**
 * One run of the main job: the deploy of `TARGET_SHA` under the retry counter `RETRY`, by the engine image the last apply published, to
 * the environment its stamp names. Where that environment deploys releases only, a release tag must name the target before the
 * deploy starts, as no code of the target has run yet; the rule is read from the image, never from a value a start call can set. Resolves
 * to the run's exit code (lib/deploy/main-job.ts): deployed, the target serving already included; blocked, when a required secret the
 * operator owes or an apply stopped it, which its record names; or failed. A run outside an engine image (a definition from before it)
 * takes `MODE` from its env, and the deploy ends it `apply needed`.
 */
export async function mainJob(env: NodeJS.ProcessEnv, fx: MainJobEffects): Promise<number> {
  const sha = env.TARGET_SHA;
  let stamp: EngineStamp | undefined;
  try {
    stamp = fx.stamp();
  } catch (error) {
    console.error(`[main-job] ${errorMessage(error)}`);
    return MAIN_JOB_EXIT.failed;
  }
  const mode = stamp?.mode ?? env.MODE;
  const key = deployKey(env);
  const projectId = env.SCW_DEFAULT_PROJECT_ID ?? '';
  if (!mode || !sha || !COMMIT.test(sha) || !key) {
    console.error('The main job needs its engine stamp (or MODE), TARGET_SHA (a full commit id) and the deploy key.');
    return MAIN_JOB_EXIT.failed;
  }
  const retry = env.RETRY && /^\d+$/.test(env.RETRY) ? env.RETRY : '0';
  console.info(`[main-job] ${mode}: ${sha} (retry ${retry})`);
  if (defaultRule(mode)?.kind === 'releases') {
    const refs = await fx.releaseRefs({ mode, key, projectId }).catch((error: unknown) => {
      console.error(`[main-job] the release tags could not be listed: ${errorMessage(error)}`);
      return undefined;
    });
    if (!refs) return MAIN_JOB_EXIT.failed;
    if (!isReleaseCommit(refs, sha)) {
      console.error(`${mode} deploys releases only: ${sha} is no release`);
      return MAIN_JOB_EXIT.failed;
    }
  }
  const deployEnv = Object.fromEntries(Object.entries(env).filter(([name]) => name !== 'DEPLOY_KEY_JSON'));
  const deployed = fx.run('deploy', ['--mode', mode, '--sha', sha, '--retry', retry], {
    ...deployEnv,
    SCW_ACCESS_KEY: key.accessKey,
    SCW_SECRET_KEY: key.secretKey,
  });
  if (deployed === MAIN_JOB_EXIT.blocked) {
    console.info('[main-job] blocked: the record names what is owed, a runtime value or an apply; the runner does not start this target again');
    return MAIN_JOB_EXIT.blocked;
  }
  if (deployed !== MAIN_JOB_EXIT.deployed) return MAIN_JOB_EXIT.failed;
  console.info('[main-job] deployed');
  return MAIN_JOB_EXIT.deployed;
}

/** The effects of a real run: the image's stamp, `git ls-remote` of the image's repository, and the deploy task in a child. */
function liveEffects(): MainJobEffects {
  return {
    stamp: () => readEngineStamp(),
    releaseRefs: async ({ mode, key, projectId }) => {
      process.env.APP_MODE = mode;
      const [{ engineConfig }, { deriveInfra }, { createSecretManagerClient }, { readRepositoryKey, repositoryUrl }, { listRemoteRefs }] =
        await Promise.all([
          import('../config/engine-config'),
          import('../lib/naming'),
          import('../lib/scaleway/scaleway-secret-manager'),
          import('../lib/deploy/repository-key'),
          import('../lib/deploy/git-remote'),
        ]);
      const { region } = deriveInfra(engineConfig);
      const readKey = await readRepositoryKey(createSecretManagerClient({ secretKey: key.secretKey, region, projectId }));
      return listRemoteRefs(repositoryUrl(), readKey)(['refs/tags/*']);
    },
    run: (script, args, env) =>
      spawnSync('pnpm', ['--silent', 'run', script, ...args], { cwd: infraDir, stdio: 'inherit', env }).status ?? MAIN_JOB_EXIT.failed,
  };
}

if (isMain(import.meta.url)) process.exit(await mainJob(process.env, liveEffects()));
