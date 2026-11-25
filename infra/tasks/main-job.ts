import { spawnSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type EngineStamp, readEngineStamp } from '../lib/deploy/applied-engine';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { RunRecorder } from '../lib/deploy/run-record';
import { type ScheduledEffects, scheduledVerdict } from '../lib/deploy/scheduled-run';
import { COMMIT, commitName, defaultRule, isReleaseCommit, type RemoteRef } from '../lib/deploy/target';
import { leaseOwnerOfRun } from '../lib/stack/control-store';
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
  /** Whether the repository's default branch contains the commit, read with the same read key. */
  onDefaultBranch(opts: { mode: string; key: DeployKey; projectId: string; sha: string }): Promise<boolean>;
  /** The lease, the reads and the record write of a scheduled run. */
  scheduledEffects(opts: { mode: string; key: DeployKey; projectId: string }): Promise<ScheduledEffects>;
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
 * One run of the main job, by the engine image the last apply published, to the environment its stamp names. A start by hand sets the
 * target, `TARGET_SHA` under the retry counter `RETRY`. A run the schedule started sets neither: it finds the target as the
 * environments file at the head of the default branch names it, and deploys it, under the lease, only when no run record has that target
 * and counter (lib/deploy/scheduled-run.ts); otherwise it ends deployed with the line that says why. Where the environment deploys releases only, a release tag must name the
 * target and the default branch must contain it before the deploy starts, as no code of the target has run yet; the rule is read from the
 * image, never from a value a start call can set. Resolves to the run's exit code (lib/deploy/main-job.ts): deployed, the target serving already included; blocked, when a
 * required secret the operator owes or an apply stopped it, which its record names; or failed, a scheduled run that could not read its
 * target included. A run outside an engine image (a definition from before it) takes `MODE` from its env, and the deploy ends it `apply needed`.
 */
export async function mainJob(env: NodeJS.ProcessEnv, fx: MainJobEffects): Promise<number> {
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
  if (!mode || !key) {
    console.error('The main job needs its engine stamp (or MODE) and the deploy key.');
    return MAIN_JOB_EXIT.failed;
  }
  if (env.TARGET_SHA) {
    const retry = env.RETRY && /^\d+$/.test(env.RETRY) ? env.RETRY : '0';
    return deployTarget(env, fx, { mode, key, projectId, sha: env.TARGET_SHA, retry });
  }
  // The start to the second: the stamp of the run's id, and its record's start.
  const started = new Date(Math.floor(Date.now() / 1000) * 1000);
  let effects: ScheduledEffects | undefined;
  let run: string | undefined;
  try {
    effects = await fx.scheduledEffects({ mode, key, projectId });
    const verdict = await scheduledVerdict(mode, effects, started);
    if ('done' in verdict) {
      console.info(`[main-job] ${mode}: ${verdict.done}`);
      return MAIN_JOB_EXIT.deployed;
    }
    ({ run } = verdict);
    console.info(`[main-job] ${mode}: ${verdict.deploy.source} has no run under retry ${verdict.deploy.retry}: run ${run} deploys it`);
    const { sha, retry } = verdict.deploy;
    const scheduled = effects;
    // The record this run opened ends with the reason: the schedule starts no target twice, and Deploy logs says why.
    const refused = async (why: string) => {
      const recorder = new RunRecorder({ run: verdict.run, environment: mode, target: sha, retry, now: started });
      recorder.finish('failed', why);
      await scheduled.writeRecord(recorder.record());
    };
    return await deployTarget(env, fx, { mode, key, projectId, sha, retry: String(retry), run, refs: verdict.refs, refused });
  } catch (error) {
    console.error(`[main-job] ${mode}: starts nothing, as ${errorMessage(error)}`);
    return MAIN_JOB_EXIT.failed;
  } finally {
    // The deploy took the lease over and released it; this one is for a deploy that ended before it took it.
    if (run) await effects?.releaseLease(leaseOwnerOfRun(run)).catch(() => undefined);
  }
}

interface DeployTargetOptions {
  mode: string;
  key: DeployKey;
  projectId: string;
  sha: string;
  retry: string;
  run?: string;
  refs?: RemoteRef[];
  /** Ends the record a scheduled run opened, with the reason its target does not deploy. */
  refused?: (why: string) => Promise<void>;
}

/**
 * Why a target does not deploy where the environment deploys releases only: no release tag names it, or the default branch does not
 * contain it. A tag is one right in the repository and the branch's rules are another, and a release needs both. Undefined when it deploys.
 * @throws when the repository cannot be read.
 */
async function releaseRefusal(fx: MainJobEffects, opts: DeployTargetOptions): Promise<string | undefined> {
  const { mode, key, projectId, sha } = opts;
  const refs = opts.refs ?? (await fx.releaseRefs({ mode, key, projectId }));
  if (!isReleaseCommit(refs, sha)) return `${mode} deploys releases only: ${sha} is no release`;
  if (await fx.onDefaultBranch({ mode, key, projectId, sha })) return undefined;
  return `${mode} deploys releases of the default branch only, which does not contain ${commitName(refs, sha)} (${sha})`;
}

/**
 * Deploy one target in a child, after the release check where the environment deploys releases only. A scheduled run hands its run id,
 * whose record and lease it opened, and the refs it found the target with.
 */
async function deployTarget(env: NodeJS.ProcessEnv, fx: MainJobEffects, opts: DeployTargetOptions): Promise<number> {
  const { mode, key, sha, retry } = opts;
  if (!COMMIT.test(sha)) {
    console.error(`The main job deploys a full commit id, and TARGET_SHA '${sha}' is none.`);
    return MAIN_JOB_EXIT.failed;
  }
  console.info(`[main-job] ${mode}: ${sha} (retry ${retry})`);
  if (defaultRule(mode)?.kind === 'releases') {
    const refusal = await releaseRefusal(fx, opts).catch(
      (error: unknown) => `the release check could not read the repository: ${errorMessage(error)}`,
    );
    if (refusal) {
      console.error(`[main-job] ${refusal}`);
      await opts.refused?.(refusal);
      return MAIN_JOB_EXIT.failed;
    }
  }
  const deployEnv = Object.fromEntries(Object.entries(env).filter(([name]) => name !== 'DEPLOY_KEY_JSON'));
  const deployed = fx.run('deploy', ['--mode', mode, '--sha', sha, '--retry', retry, ...(opts.run ? ['--run', opts.run] : [])], {
    ...deployEnv,
    // The live record names its writer by this value (controlActor), which a scheduled run's env lacks.
    TARGET_SHA: sha,
    SCW_ACCESS_KEY: key.accessKey,
    SCW_SECRET_KEY: key.secretKey,
  });
  if (deployed === MAIN_JOB_EXIT.blocked) {
    console.info('[main-job] blocked: the record names what is owed, a runtime value or an apply; no scheduled run starts this target again');
    return MAIN_JOB_EXIT.blocked;
  }
  if (deployed !== MAIN_JOB_EXIT.deployed) return MAIN_JOB_EXIT.failed;
  console.info('[main-job] deployed');
  return MAIN_JOB_EXIT.deployed;
}

/**
 * The effects of a real run: the image's stamp, `git ls-remote` of the image's repository, a scheduled run's lease, reads and record on
 * the deploy key, and the deploy task in a child.
 */
function liveEffects(): MainJobEffects {
  /** The image's repository with the read key a private one needs, and the git reads of it. */
  const repositoryReads = async ({ mode, key, projectId }: { mode: string; key: DeployKey; projectId: string }) => {
    process.env.APP_MODE = mode;
    const [{ engineConfig }, { deriveInfra }, { createSecretManagerClient }, { readRepositoryKey, repositoryUrl }, gitRemote] = await Promise.all([
      import('../config/engine-config'),
      import('../lib/naming'),
      import('../lib/scaleway/scaleway-secret-manager'),
      import('../lib/deploy/repository-key'),
      import('../lib/deploy/git-remote'),
    ]);
    const { region } = deriveInfra(engineConfig);
    const readKey = await readRepositoryKey(createSecretManagerClient({ secretKey: key.secretKey, region, projectId }));
    return { repository: repositoryUrl(), readKey, ...gitRemote };
  };
  return {
    stamp: () => readEngineStamp(),
    releaseRefs: async (opts) => {
      const { repository, readKey, listRemoteRefs } = await repositoryReads(opts);
      return listRemoteRefs(repository, readKey)(['refs/tags/*']);
    },
    onDefaultBranch: async ({ sha, ...opts }) => {
      const { repository, readKey, defaultBranchContains } = await repositoryReads(opts);
      return defaultBranchContains({ repository, key: readKey, dir: await mkdtemp(join(tmpdir(), 'default-branch-')), sha });
    },
    scheduledEffects: async ({ mode, key, projectId }) => {
      process.env.APP_MODE = mode;
      const [
        { engineConfig },
        { deriveInfra },
        { createSecretManagerClient },
        { readRepositoryKey, repositoryUrl },
        { listRemoteRefs },
        { readEnvironmentsFile },
        { makeS3Client, projectAccessKey },
        { acquireLock, handOverLock, lockKey, makeControlClient, releaseLock },
        { bucketRunStore, commitRecords, putRunRecord },
      ] = await Promise.all([
        import('../config/engine-config'),
        import('../lib/naming'),
        import('../lib/scaleway/scaleway-secret-manager'),
        import('../lib/deploy/repository-key'),
        import('../lib/deploy/git-remote'),
        import('../lib/deploy/environments-file'),
        import('../lib/scaleway/s3-client'),
        import('../lib/stack/control-store'),
        import('../lib/deploy/run-store'),
      ]);
      const { naming, region } = deriveInfra(engineConfig);
      const bucket = naming.bootDiagBucket;
      const bucketKey = projectAccessKey(key.accessKey, projectId);
      const control = await makeControlClient(region, bucketKey, key.secretKey);
      const s3 = await makeS3Client(region, bucketKey, key.secretKey);
      const repository = repositoryUrl();
      // Read once the lease is held, as every read after it.
      let readKey: Promise<string | undefined> | undefined;
      const repositoryKey = () => {
        readKey ??= readRepositoryKey(createSecretManagerClient({ secretKey: key.secretKey, region, projectId }));
        return readKey;
      };
      // The deploy renews the lease from the moment it takes it over; this covers the look and the deploy's start.
      const ttlMs = 5 * 60_000;
      return {
        takeLease: async (owner, operation) => {
          const result = await acquireLock(control, bucket, lockKey(mode), { owner, operation, ttlMs });
          return result.acquired ? undefined : result.held;
        },
        handOverLease: (from, to, operation) => handOverLock(control, bucket, lockKey(mode), { from, to, operation, ttlMs }),
        releaseLease: (owner) => releaseLock(control, bucket, lockKey(mode), { owner }),
        environmentsFile: async () =>
          readEnvironmentsFile({ repository, key: await repositoryKey(), dir: await mkdtemp(join(tmpdir(), 'environments-')) }),
        listRemote: async (patterns) => listRemoteRefs(repository, await repositoryKey())(patterns),
        records: (sha) => commitRecords(bucketRunStore(s3, bucket), sha),
        writeRecord: (record) => putRunRecord(s3, bucket, record),
      };
    },
    run: (script, args, env) =>
      spawnSync('pnpm', ['--silent', 'run', script, ...args], { cwd: infraDir, stdio: 'inherit', env }).status ?? MAIN_JOB_EXIT.failed,
  };
}

if (isMain(import.meta.url)) process.exit(await mainJob(process.env, liveEffects()));
