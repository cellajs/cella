import { existsSync } from 'node:fs';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { APPLY_NEEDED, ApplyNeededError, descriptionMismatch, type EngineStamp, engineMismatch, readEngineStamp } from '../lib/deploy/applied-engine';
import { describeChanges } from '../lib/deploy/description-diff';
import { type DeployTarget, type LiveRecord, rolesToReplace } from '../lib/deploy/live-record';
import { MAIN_JOB_EXIT } from '../lib/deploy/main-job';
import { parseReleaseManifest, type ReleaseManifest } from '../lib/deploy/release-archives';
import { type RunBootAccount, type RunRecord, RunRecorder, runId, runLogKey, runRecordKey, runStartedAt } from '../lib/deploy/run-record';
import type { MachineRole } from '../lib/machine-roles';
import { actionCommand } from '../lib/operator-actions';
import { deployS3Key, makeS3Client } from '../lib/scaleway/s3-client';
import { deployEvents, deployTelemetry, initDeployTelemetry } from '../lib/telemetry/deploy-telemetry';
import { otlpConfigFromEnv } from '../lib/telemetry/emitter';
import { ExitCodeError, errorMessage } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';
import type { MachineEnv } from './compose-env';
import { type AllowedKey, buildDeployEnv } from './deploy-env';
import type { SwitchResult } from './switch-machines';

/**
 * The whole deploy, in order: the lease, the live record's verdict, the engine image it runs, the required runtime values, the build, the
 * target's description held against the engine's, each role's env file, the switch of every role that does not serve the target, the links
 * taken off the new machines, the frontend entry files, the smoke checks, and boot accounts on failure. The main job runs this with the deploy key in `SCW_*`, the one key it needs; it
 * touches no Pulumi state, no network and no pool.
 */
export interface DeployOptions {
  mode: string;
  sha: string;
  /** The retry counter of the environment's line: a raised one deploys the target again, onto new machines. */
  retry: number;
  /** The run's id in its record and on the lease, a scheduled run's that opened both; a new one (start time and target) when not given. */
  run?: string;
}

/** Deploy step tasks runnable in-process (tasks/<name>.ts, main(argv) throws on failure). */
export type TaskName = 'build-release' | 'compose-env' | 'clear-machine-links' | 'geoip-refresh' | 'smoke';

/** What the switch step is handed: the roles to switch, the record they switch from, the target, and the release the build checked. */
export interface SwitchRequest {
  stack: string;
  roles: readonly MachineRole[];
  pending: readonly string[];
  record: LiveRecord;
  target: DeployTarget;
  manifest: ReleaseManifest;
  envs: readonly MachineEnv[];
  /** Each role as it switches, so a failed run still names its new machines. */
  switched: SwitchResult[];
  /** Each stop-first role's new machine a failed switch kept. */
  kept: SwitchResult[];
}

/** One executed step. Steps run in-process via `task`. */
export interface DeployEffects {
  /** Create the deploy emitter (OTLP config resolution may hit Secret Manager). */
  initTelemetry(init: { mode: string; sha: string }): Promise<void>;
  /** Run a task module's main(argv) in-process; throws on failure. */
  task(name: TaskName, argv?: string[]): Promise<void>;
  /** A file a task wrote for the steps after it. */
  readFile(path: string): Promise<string>;
  /**
   * Hold the environment's lease for the run, under the run's id (renewed in-process, released on exit or signal); throws when another
   * holder keeps it.
   */
  lease(stack: string, operation: 'deploy', run: string): Promise<{ release(): Promise<void>; readonly lost: boolean }>;
  /** The environment's machine roles, the live record and the rotation counter. */
  readLive(stack: string): Promise<{ roles: MachineRole[]; record: LiveRecord; rotation: number }>;
  /** The stamp of the engine image the run started from; undefined outside one. */
  engineStamp(): EngineStamp | undefined;
  /** The description of the app the engine image holds, which names what a target's own description changes. */
  engineDescription(): Promise<Record<string, unknown>>;
  /** Switch the roles given (tasks/switch-machines.ts). */
  switchMachines(request: SwitchRequest): Promise<void>;
  publishEntryFiles(opts: { distDir: string; bucket: string; region: string }): Promise<void>;
  /** The boot accounts this run's machines uploaded to the keys the compose step named, one per role; none for a role with no account yet. */
  bootAccounts(envs: readonly MachineEnv[]): Promise<RunBootAccount[]>;
  /** Write a run's record and log to the environment's diagnostics bucket. */
  writeRunRecord(opts: { bucket: string; region: string; record: RunRecord; log: string }): Promise<void>;
  group(title: string): void;
  groupEnd(): void;
  info(msg: string): void;
}

/** The steps from which a release's machines have booted: their boot accounts say why one did not come up. */
const STEPS_WITH_MACHINES = new Set(['Switch machines', 'Take the links off the new machines', 'Smoke tests']);

/** What a failed deploy says last: the step it stopped at, and where to read the machines' boot accounts only when machines of the release booted. */
export function deployFailureHint(err: unknown, mode: string): { description: string; command?: string } {
  const step = (err as { deployStep?: string } | undefined)?.deployStep;
  const where = step ? `It stopped at "${step}". ` : '';
  if (err instanceof ApplyNeededError) {
    return err.remedy === 'apply'
      ? {
          description: `${where}An apply from a checkout at the target publishes its engine and description, then starts the target again:`,
          command: `${actionCommand('apply')} --mode ${mode}`,
        }
      : {
          description: `${where}No apply deploys a target older than the applied engine: pin a newer release in infra/environments, or roll forward.`,
        };
  }
  if (step && !STEPS_WITH_MACHINES.has(step)) return { description: `${where}Re-running is safe: the live record says what serves.` };
  return {
    description: `${where}Re-running is safe: a role that switched serves the target and is left as it is. The run's record names each new machine's boot account, and Deploy logs prints a failed one:`,
    command: `pnpm infra runs --mode ${mode}`,
  };
}

export function parseDeployArgs(argv: string[]): DeployOptions {
  const mode = getFlag(argv, '--mode');
  const sha = getFlag(argv, '--sha');
  if (!mode || !sha) throw new Error('Usage: deploy.ts --mode <staging|production> --sha <git-sha> [--retry <n>]');
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`);
  const retry = Number(getFlag(argv, '--retry') ?? '0');
  if (!Number.isInteger(retry) || retry < 0) throw new Error('--retry must be a whole number');
  return { mode, sha, retry, run: getFlag(argv, '--run') };
}

/** Derive the deploy env table from the app config for the requested mode. */
async function loadDeployEnvFromConfig(opts: DeployOptions): Promise<Record<AllowedKey, string>> {
  process.env.APP_MODE = opts.mode;
  const { engineConfig: appConfig } = await import('../config/engine-config');
  if (appConfig.mode !== opts.mode) throw new Error(`Mode mismatch: requested "${opts.mode}" but loaded config is "${appConfig.mode}"`);
  return buildDeployEnv(appConfig, { imageTag: opts.sha });
}

export async function runDeploy(
  opts: DeployOptions,
  fx: DeployEffects,
  loadDeployEnv: (opts: DeployOptions) => Promise<Record<AllowedKey, string>> = loadDeployEnvFromConfig,
): Promise<void> {
  const env = await loadDeployEnv(opts);
  const stack = env.stack;

  // One run, one record: written at the start, after every step and at the end, so a run killed at the job's limit still shows how far it came.
  const recorder = new RunRecorder({
    run: opts.run ?? runId(opts.sha),
    environment: opts.mode,
    target: opts.sha,
    retry: opts.retry,
    now: opts.run ? runStartedAt(opts.run) : undefined,
  });
  const say = (message: string) => {
    recorder.line(message);
    fx.info(message);
  };
  let recordUnwritable = false;
  const persist = () =>
    fx.writeRunRecord({ bucket: env.diag_bucket, region: env.region, record: recorder.record(), log: recorder.log() }).catch((err) => {
      if (!recordUnwritable) fx.info(`[deploy] the record of run ${recorder.record().run} could not be written: ${errorMessage(err)}`);
      recordUnwritable = true;
    });
  say(`[deploy] run ${recorder.record().run}: ${opts.sha} to ${opts.mode} (retry ${opts.retry})`);
  await persist();
  await fx.initTelemetry({ mode: opts.mode, sha: opts.sha });
  const telemetry = deployTelemetry();
  const deploySpan = telemetry?.startSpan(`deploy ${opts.mode}`, { sha: opts.sha });
  // New machines bake this context into their boot plans, so their boot spans join the deploy trace.
  if (deploySpan) process.env.TRACEPARENT = deploySpan.traceparent();
  telemetry?.event(deployEvents.started, { mode: opts.mode, sha: opts.sha });

  const step = async (title: string, run: () => void | Promise<void>): Promise<void> => {
    // A run whose lease another took must change nothing more: the other run holds the environment now.
    if (lease?.lost) throw new Error(`the lease was taken by another run before "${title}": this run stops`);
    fx.group(title);
    const span = telemetry?.startSpan(title, { step: title }, deploySpan?.ctx);
    const startedAt = Date.now();
    try {
      await run();
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      span?.end('ok');
      telemetry?.event(deployEvents.stepCompleted, { step: title, duration_s: seconds }, { ctx: span?.ctx });
      recorder.step(title, seconds, 'ok');
      say(`[deploy] ${title}: ok (${seconds}s)`);
      await persist();
    } catch (err) {
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      recorder.step(title, seconds, 'error');
      recorder.line(`[deploy] ${title}: failed (${seconds}s): ${errorMessage(err)}`);
      span?.end('error', { message: errorMessage(err) });
      const failAttrs: { step: string; error: string; 'error.stack'?: string } = { step: title, error: errorMessage(err) };
      if (err instanceof Error && err.stack) failAttrs['error.stack'] = err.stack.slice(0, 4000);
      telemetry?.event(deployEvents.stepFailed, failAttrs, { severity: 'error', ctx: span?.ctx });
      if (err instanceof Error) Object.assign(err, { deployStep: (err as { deployStep?: string }).deployStep ?? title });
      throw err;
    } finally {
      fx.groupEnd();
    }
  };

  let lease: { release(): Promise<void>; readonly lost: boolean } | undefined;
  // Each role's env file and boot account, as the compose step wrote them; cleared at the end of the run whatever stopped it.
  const work = await mkdtemp(join(tmpdir(), 'deploy-'));
  const envsFile = join(work, 'envs.json');
  const machinesFile = join(work, 'machines.json');
  const switched: SwitchResult[] = [];
  const kept: SwitchResult[] = [];
  let envsWritten = false;
  let linksCleared = false;
  let unchanged = false;
  let outcome: 'ok' | 'error' = 'ok';
  let failure: unknown;
  try {
    await step('Acquire the lease', async () => {
      lease = await fx.lease(stack, 'deploy', recorder.record().run);
    });
    // The live record decides what this run does: every role that serves the target, under the same retry counter and rotation, is left
    // as it is, so running the same deploy twice changes nothing.
    let live: Awaited<ReturnType<DeployEffects['readLive']>> | undefined;
    let target: DeployTarget = { commit: opts.sha, retry: opts.retry, rotation: 0 };
    let pending: string[] = [];
    await step('Read the live record', async () => {
      live = await fx.readLive(stack);
      target = { ...target, rotation: live.rotation };
      pending = rolesToReplace(
        live.record,
        live.roles.map((role) => role.role),
        target,
      );
      const retired = Object.keys(live.record.roles).filter((role) => !live?.roles.some((declared) => declared.role === role));
      unchanged = pending.length === 0 && retired.length === 0;
      say(
        unchanged
          ? `[deploy] every role serves ${opts.sha.slice(0, 10)} (retry ${opts.retry}, rotation ${live.rotation}): unchanged`
          : `[deploy] to switch: ${[...pending, ...retired.map((role) => `${role} (retired)`)].join(', ')}`,
      );
    });

    if (!unchanged && live) {
      // Nothing of the release is needed to refuse a run outside the engine image, or a required value the runtime folder lacks: both stop
      // the run before a builder is made, and the apply or storing the value starts it again.
      let stamp: EngineStamp | undefined;
      await step('Check the engine', () => {
        stamp = fx.engineStamp();
        const owed = engineMismatch(stamp, opts.mode);
        if (owed) throw owed;
      });
      await step('Check runtime secrets', () => fx.task('compose-env', ['--check', '--project-id', process.env.SCW_DEFAULT_PROJECT_ID ?? '']));

      // The release's archives and frontend files: a builder machine makes the missing ones and writes them through links, then the release's
      // entry files wait in a folder of their own for the publish below. No app code runs beside the deploy key.
      const distDir = env.frontend_bucket ? await mkdtemp(join(tmpdir(), 'release-')) : '';
      const manifestFile = join(work, 'manifest.json');
      let manifest: ReleaseManifest | undefined;
      await step('Build the release', async () => {
        await fx.task('build-release', [
          '--sha',
          opts.sha,
          '--mode',
          opts.mode,
          '--project-id',
          process.env.SCW_DEFAULT_PROJECT_ID ?? '',
          '--build-images-json',
          env.build_images_matrix,
          '--services-json',
          env.enabled_services_json,
          '--dist',
          distDir,
          '--manifest-out',
          manifestFile,
        ]);
        manifest = parseReleaseManifest(await fx.readFile(manifestFile), opts.sha);
      });

      // The engine composes, boots and switches as its own description says: a target that describes the app otherwise ends the run
      // before any value is read.
      await step('Check the description', async () => {
        if (!stamp || !manifest) throw new Error('the description is checked after the engine and the build');
        const { describes, description } = manifest;
        // The paths only name the change: without them the run ends apply needed all the same, with the two hashes.
        const changes =
          describes && description !== stamp.descriptionHash
            ? await fx.engineDescription().then(
                (engine) => describeChanges(engine, describes),
                () => [],
              )
            : [];
        const owed = descriptionMismatch(stamp, opts.sha, description, changes);
        if (owed) throw owed;
        say(`[deploy] ${opts.sha.slice(0, 10)} describes the app as the applied engine does`);
      });

      // The deploy writes no value of the app's: the apply makes them, and Update identities the uploads key. Here it reads them from the
      // runtime folder and writes each role's env file, which only it reads; a value that is empty or not one line ends the run blocked
      // before any machine of the release boots, and storing it starts the target again.
      await step('Compose runtime env', async () => {
        await fx.task('compose-env', ['--sha', opts.sha, '--project-id', process.env.SCW_DEFAULT_PROJECT_ID ?? '', '--out', envsFile]);
        envsWritten = true;
      });

      // GeoIP databases live in the public bucket, not the image: a first deploy fills the prefix, later ones refresh it
      // once a month. Best-effort: a DB-IP or bucket hiccup must never block a release, the API only loses the country line.
      if (env.public_bucket) {
        await step('Ensure GeoIP data', async () => {
          try {
            await fx.task('geoip-refresh', ['--bucket', env.public_bucket, '--region', env.region, '--max-age-days', '35']);
          } catch (err) {
            say(`[deploy] GeoIP data refresh skipped: ${errorMessage(err)}`);
          }
        });
      }

      try {
        await step('Switch machines', async () => {
          const envs = JSON.parse(await fx.readFile(envsFile)) as MachineEnv[];
          if (!manifest || !live) throw new Error('the switch runs after the build');
          await fx.switchMachines({ stack, roles: live.roles, pending, record: live.record, target, manifest, envs, switched, kept });
        });
      } catch (err) {
        telemetry?.event(deployEvents.switchFailed, { error: errorMessage(err) }, { severity: 'error' });
        say("[deploy] a switch failed; reading the release's boot accounts");
        // This run's own keys: an account an earlier attempt at the same commit uploaded names another boot.
        const envs = JSON.parse(await fx.readFile(envsFile).catch(() => '[]')) as MachineEnv[];
        const accounts = await fx.bootAccounts(envs).catch((diagErr) => {
          say(`[deploy] the boot accounts could not be read: ${errorMessage(diagErr)}`);
          return undefined;
        });
        if (accounts) {
          recorder.boot(accounts);
          for (const account of accounts) {
            say(
              `[deploy] ${account.service}: ${account.key ? `${account.failed ? 'boot failed' : 'booted'} (${account.key})` : 'no account of this release: its agent has not finished'}`,
            );
          }
        }
        throw err;
      } finally {
        const made = [
          ...switched.map(({ role, machine }) => ({ role, machine })),
          ...kept.map(({ role, machine }) => ({ role, machine, kept: true })),
        ];
        await writeFile(machinesFile, JSON.stringify(made), { mode: 0o600 });
      }
      // Each new machine fetched its env file and archives: once its boot account arrived, its user data keeps no link and its env file goes.
      await step('Take the links off the new machines', async () => {
        await fx.task('clear-machine-links', ['--envs', envsFile, '--machines', machinesFile]);
        linksCleared = true;
      });

      // Strictly after the switches, so users only load the new entry files once every pool serves the new release. Skipped for a frontend-less registry.
      if (env.frontend_bucket) {
        await step('Publish frontend entry files', () => fx.publishEntryFiles({ distDir, bucket: env.frontend_bucket, region: env.region }));
      }
      await step('Smoke tests', () =>
        fx.task('smoke', [
          '--sha',
          opts.sha,
          '--services-json',
          env.enabled_services_json,
          // The primary role owns smoke's aggregate-health and OpenAPI checks, with no service-name literal.
          ...(env.primary_role ? ['--primary', env.primary_role] : []),
          // A provided-but-unreadable --dist is a hard failure in smoke, so a frontend-less registry omits the flag.
          ...(env.frontend_bucket ? ['--dist', resolve(distDir, 'index.html')] : []),
        ]),
      );
    }
  } catch (err) {
    outcome = 'error';
    failure = err;
    throw err;
  } finally {
    // Whatever stopped the run before its step did, no env file outlives it and no machine of it keeps a link.
    if (envsWritten && !linksCleared) {
      await fx
        .task('clear-machine-links', ['--envs', envsFile, '--machines', machinesFile, '--no-wait'])
        .catch((err) => say(`[deploy] the links stay until they end, the env files until the bucket's rule: ${errorMessage(err)}`));
    }
    await lease?.release().catch((err) => say(`[deploy] lease release failed: ${errorMessage(err)}`));
    // A required secret or an apply owed ends the run blocked, not failed: the operator stores it or applies, then the same target.
    const blocked = failure instanceof ExitCodeError && failure.exitCode === MAIN_JOB_EXIT.blocked;
    const ended = failure instanceof ApplyNeededError ? APPLY_NEEDED : blocked ? 'blocked' : 'failed';
    recorder.finish(outcome === 'ok' ? (unchanged ? 'unchanged' : 'deployed') : ended, outcome === 'ok' ? undefined : errorMessage(failure));
    const run = recorder.record().run;
    await persist();
    if (!recordUnwritable) fx.info(`[deploy] record of run ${run}: s3://${env.diag_bucket}/${runRecordKey(run)} (log: ${runLogKey(run)})`);
    deploySpan?.end(outcome);
    telemetry?.event(
      outcome === 'ok' ? deployEvents.completed : deployEvents.failed,
      { mode: opts.mode, sha: opts.sha },
      outcome === 'ok' ? {} : { severity: 'error' },
    );
    await telemetry?.flush();
  }
}
const ENTRY_FILES: Array<{ name: string; contentType: string }> = [
  { name: 'index.html', contentType: 'text/html; charset=utf-8' },
  { name: 'sw.js', contentType: 'text/javascript; charset=utf-8' },
  { name: 'manifest.webmanifest', contentType: 'application/manifest+json' },
];

/** Write a run's record and log to the diagnostics bucket with the deploy key, which may write objects there. */
async function writeRunRecordToBucket(opts: { bucket: string; region: string; record: RunRecord; log: string }): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { accessKey, secretKey } = deployS3Key();
  const s3 = await makeS3Client(opts.region, accessKey, secretKey);
  const { putRunRecord } = await import('../lib/deploy/run-store');
  await putRunRecord(s3, opts.bucket, opts.record);
  await s3.send(
    new PutObjectCommand({ Bucket: opts.bucket, Key: runLogKey(opts.record.run), Body: opts.log, ContentType: 'text/plain; charset=utf-8' }),
  );
}

async function publishEntryFilesToBucket(opts: { distDir: string; bucket: string; region: string }): Promise<void> {
  const { PutObjectCommand } = await import('@aws-sdk/client-s3');
  const { accessKey, secretKey } = deployS3Key();
  const s3 = await makeS3Client(opts.region, accessKey, secretKey);
  for (const file of ENTRY_FILES) {
    const path = resolve(opts.distDir, file.name);
    if (!existsSync(path)) continue;
    const body = await readFile(path);
    await s3.send(
      new PutObjectCommand({
        Bucket: opts.bucket,
        Key: file.name,
        Body: body,
        ContentType: file.contentType,
        CacheControl: 'no-cache, no-store, must-revalidate',
      }),
    );
    console.info(`[deploy] published ${basename(path)} (${body.length} bytes)`);
  }
}

// Each task stays an independent CLI (tsx tasks/<name>.ts) for operators, while the deploy runs the same mains in-process so config is read once and a failing step keeps its stack trace.
const taskRunners: Record<TaskName, (argv: string[]) => Promise<void>> = {
  'build-release': async (argv) => (await import('./build-release')).main(argv),
  'compose-env': async (argv) => (await import('./compose-env')).main(argv),
  'clear-machine-links': async (argv) => (await import('./clear-machine-links')).main(argv),
  'geoip-refresh': async (argv) => (await import('./geoip-refresh')).main(argv),
  smoke: async (argv) => (await import('./smoke')).main(argv),
};

/** The deploy key's S3 client on the environment's diagnostics bucket, which holds the run records, the control records and the release. */
async function diagnosticsClient(region: string) {
  const { projectAccessKey } = await import('../lib/scaleway/s3-client');
  const { accessKey, secretKey } = deployS3Key();
  return makeS3Client(region, projectAccessKey(accessKey, process.env.SCW_DEFAULT_PROJECT_ID ?? ''), secretKey);
}

/** The same key on the control records (the lease, the live record, the rotations). */
async function controlClient(region: string) {
  const [{ projectAccessKey }, { makeControlClient }] = await Promise.all([
    import('../lib/scaleway/s3-client'),
    import('../lib/stack/control-store'),
  ]);
  const { accessKey, secretKey } = deployS3Key();
  return makeControlClient(region, projectAccessKey(accessKey, process.env.SCW_DEFAULT_PROJECT_ID ?? ''), secretKey);
}

function createRealEffects(): DeployEffects {
  return {
    async initTelemetry({ mode, sha }) {
      let config = otlpConfigFromEnv();
      if (!config) {
        const [{ sinkIngestKeyFromSecretManager }, { telemetrySink }] = await Promise.all([
          import('../lib/telemetry/sink-key'),
          import('../config/telemetry.config'),
        ]);
        const lookup = await sinkIngestKeyFromSecretManager().catch((err: unknown) => ({ missing: `lookup failed: ${errorMessage(err)}` }));
        if ('key' in lookup) {
          config = { endpoint: telemetrySink.endpoint, headers: { [telemetrySink.keyHeader]: lookup.key } };
          // In-process consumers (black-box replay on failure) resolve via env.
          process.env[telemetrySink.keyEnvVar] ??= lookup.key;
        } else {
          // A deploy whose telemetry goes nowhere says so in its log, which its run record keeps.
          console.warn(`[deploy] telemetry ingest key unavailable: ${lookup.missing}`);
        }
      }
      if (!config) console.info('[deploy] telemetry export disabled (no ingest key); black box only');
      initDeployTelemetry({
        mode,
        sha,
        endpoint: config?.endpoint,
        headers: config?.headers,
        onError: (message) => console.warn(`[deploy] ${message}`),
      });
    },
    task: (name, argv = []) => taskRunners[name](argv),
    readFile: (path) => readFile(path, 'utf8'),
    async lease(stack, operation, run) {
      const [{ leaseOwnerOfRun, lockKey }, { acquireLease, installSignalRelease }, { engineConfig }, { deriveInfra }] = await Promise.all([
        import('../lib/stack/control-store'),
        import('../lib/stack/stack-lease'),
        import('../config/engine-config'),
        import('../lib/naming'),
      ]);
      const { naming, region } = deriveInfra(engineConfig);
      // A deploy queues behind another one for a while; a dead holder's lease lapses within its lifetime.
      const result = await acquireLease({
        s3: await controlClient(region),
        bucket: naming.bootDiagBucket,
        key: lockKey(stack),
        owner: leaseOwnerOfRun(run),
        operation,
        // A scheduled run hands its lease to this deploy under the deploy's run.
        adopt: true,
        ttlMs: 5 * 60_000,
        renewEveryMs: 60_000,
        waitMs: 10 * 60_000,
        pollMs: 15_000,
        onWait: (held, remainingMs) =>
          console.info(
            `[${operation}] the lease is held by ${held.owner} (${held.operation}, since ${held.acquiredAt}); waiting up to ${Math.ceil(remainingMs / 60_000)} min`,
          ),
        onRenewFailed: (reason, lost) => console.warn(`[${operation}] lease renewal failed: ${reason}${lost ? ' (lease lost)' : ''}`),
      });
      if (!result.acquired) {
        throw new Error(
          `${stack} is leased by ${result.held.owner} (operation: ${result.held.operation}, since ${result.held.acquiredAt}). If that run is dead, clear it with \`${actionCommand('unlock')}\`.`,
        );
      }
      const uninstall = installSignalRelease(result.lease, { log: (msg) => console.warn(`[${operation}] ${msg}`) });
      return {
        release: async () => {
          uninstall();
          await result.lease.release();
        },
        get lost() {
          return result.lease.lost;
        },
      };
    },
    async readLive(stack) {
      const [{ engineConfig: appConfig }, { deriveInfra }, { machineRoles }, { readLiveRecord }, { readRotations }] = await Promise.all([
        import('../config/engine-config'),
        import('../lib/naming'),
        import('../lib/machine-roles'),
        import('../lib/deploy/live-record'),
        import('../lib/stack/control-store'),
      ]);
      const { naming, region } = deriveInfra(appConfig);
      const s3 = await controlClient(region);
      const [{ record }, { rotations }] = await Promise.all([
        readLiveRecord(s3, naming.bootDiagBucket, stack),
        readRotations(s3, naming.bootDiagBucket, stack),
      ]);
      return { roles: machineRoles(appConfig), record, rotation: rotations.counter };
    },
    engineStamp: () => readEngineStamp(),
    engineDescription: async () => (await import('../lib/deploy/app-description')).appDescription(),
    async switchMachines(request) {
      const [
        { engineConfig: appConfig },
        { deriveInfra },
        { readFoundation },
        { bucketPresigner },
        { recordRole },
        { controlActor },
        { liveSwitchEffects, switchMachines },
        { appEnvSuppliers },
        { telemetrySink },
        { supplierContext },
        { projectAccessKey },
      ] = await Promise.all([
        import('../config/engine-config'),
        import('../lib/naming'),
        import('../lib/scaleway/foundation'),
        import('../lib/scaleway/presign'),
        import('../lib/deploy/live-record'),
        import('../lib/stack/control-store'),
        import('./switch-machines'),
        import('../config/env-suppliers.config'),
        import('../config/telemetry.config'),
        import('../lib/deploy/static-env'),
        import('../lib/scaleway/s3-client'),
      ]);
      const { GetObjectCommand } = await import('@aws-sdk/client-s3');
      const { naming, region, zone } = deriveInfra(appConfig);
      const projectId = process.env.SCW_DEFAULT_PROJECT_ID ?? '';
      const { accessKey, secretKey } = deployS3Key();
      const mode = appConfig.mode;
      if (mode !== 'production' && mode !== 'staging') throw new Error(`a deploy goes to production or staging, not '${mode}'`);
      const s3 = await diagnosticsClient(region);
      const control = await controlClient(region);
      const foundation = await readFoundation({ secretKey }, { region, zone, projectId, naming, mode, roles: request.roles });
      const composeContent = await readFile(resolve(import.meta.dirname, '../compose.gen.yml'), 'utf8');
      const effects = liveSwitchEffects({
        secretKey,
        projectId,
        zone,
        mode,
        naming,
        foundation,
        sha: request.target.commit,
        manifest: request.manifest,
        envs: request.envs,
        presigner: await bucketPresigner({ region, bucket: naming.bootDiagBucket, accessKey: projectAccessKey(accessKey, projectId), secretKey }),
        readAccount: (key) =>
          s3.send(new GetObjectCommand({ Bucket: naming.bootDiagBucket, Key: key })).then(
            (object) => object.Body?.transformToString(),
            () => undefined,
          ),
        record: (role, entry) => recordRole(control, naming.bootDiagBucket, request.stack, role, entry, { by: controlActor() }),
        suppliers: appEnvSuppliers,
        supplierContext: supplierContext(appConfig),
        composeContent,
        traceparent: process.env.TRACEPARENT,
        telemetry: { endpoint: telemetrySink.endpoint, keyHeader: telemetrySink.keyHeader, keyEnvVar: telemetrySink.keyEnvVar },
        log: (message) => console.info(message),
      });
      await switchMachines(
        {
          roles: request.roles,
          pending: request.pending,
          record: request.record,
          target: request.target,
          switched: request.switched,
          kept: request.kept,
        },
        effects,
      );
    },
    publishEntryFiles: publishEntryFilesToBucket,
    writeRunRecord: writeRunRecordToBucket,
    async bootAccounts(envs) {
      const [{ accountFailed, BOOT_ACCOUNTS_PREFIX }, { engineConfig }, { deriveInfra }, { GetObjectCommand }] = await Promise.all([
        import('../lib/deploy/boot-accounts'),
        import('../config/engine-config'),
        import('../lib/naming'),
        import('@aws-sdk/client-s3'),
      ]);
      const { naming, region } = deriveInfra(engineConfig);
      const s3 = await diagnosticsClient(region);
      return Promise.all(
        envs.map(async ({ service, bootAccount }): Promise<RunBootAccount> => {
          const body = await s3.send(new GetObjectCommand({ Bucket: naming.bootDiagBucket, Key: bootAccount })).then(
            (object) => object.Body?.transformToString(),
            () => undefined,
          );
          return body === undefined ? { service } : { service, key: bootAccount.slice(BOOT_ACCOUNTS_PREFIX.length), failed: accountFailed(body) };
        }),
      );
    },
    group: (title) => console.info(`\n=== ${title} ===`),
    groupEnd: () => {},
    info: (msg) => console.info(msg),
  };
}

/** Entry called by tasks/deploy.ts once APP_MODE is set (imports here evaluate shared). */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  await runDeploy(parseDeployArgs(argv), createRealEffects());
}

runIfMain(import.meta.url, main);
