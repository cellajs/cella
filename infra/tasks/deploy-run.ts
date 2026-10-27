import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { healthContract } from '../config/health.config';
import { type RunBootAccount, type RunRecord, RunRecorder, runId, runLogKey, runRecordKey } from '../lib/deploy/run-record';
import { actionCommand } from '../lib/operator-actions';
import { deployS3Key, makeS3Client } from '../lib/scaleway/s3-client';
import { adoptStateBackendEnv, stateBackendUrl } from '../lib/stack/control-store';
import { deployEvents, deployTelemetry, initDeployTelemetry } from '../lib/telemetry/deploy-telemetry';
import { otlpConfigFromEnv } from '../lib/telemetry/emitter';
import { ExitCodeError, errorMessage } from '../lib/utils/errors';
import { runIfMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';
import { type AllowedKey, buildDeployEnv } from './deploy-env';
import { main as runWavedRolloutCli } from './deploy-rollout';
import { createFetchProbe, pollForVersion } from './wait-for-version';

/**
 * The whole deploy after image builds, in order: preflights, stack lock, base stack update, waved rollout, public version verification,
 * atomic frontend entry publish, smoke checks, and boot diagnostics on failure.
 * CI (.github/workflows/deploy.yml) is a thin trigger around this; anything that supplies the SCW_* key can run it.
 */
export interface DeployOptions {
  mode: string;
  sha: string;
  /** The run's id in its record; a new one (start time and target) when not given. */
  run?: string;
}

/** Deploy step tasks runnable in-process (tasks/<name>.ts, main(argv) throws on failure). */
export type TaskName =
  | 'ensure-state-bucket'
  | 'install-pulumi-providers'
  | 'forget-retired-resources'
  | 'preflight-privileged'
  | 'build-release'
  | 'sync-rollout-config'
  | 'stage-generation-keys'
  | 'assert-grants'
  | 'assert-deploy-policy'
  | 'assert-secrets-deliverable'
  | 'geoip-refresh'
  | 'smoke';

/** One executed step. Steps run in-process via `task`; `exec` is for external binaries (pulumi login/select, docker login). */
export interface DeployEffects {
  /** Create the deploy emitter (OTLP config resolution may hit Secret Manager). */
  initTelemetry(init: { mode: string; sha: string }): Promise<void>;
  /** Run a task module's main(argv) in-process; throws on failure. */
  task(name: TaskName, argv?: string[]): Promise<void>;
  /** Hold the stack lease for the run (renewed in-process, released on exit or signal); throws when another holder keeps it. */
  lease(stack: string, operation: 'deploy'): Promise<{ release(): Promise<void>; readonly lost: boolean }>;
  /** Run an external binary in the infra dir; rejects on non-zero exit unless allowFailure. Async, so the stack lease keeps renewing while it runs. */
  exec(cmd: string, args: string[], opts?: { allowFailure?: boolean; stdin?: string; env?: Record<string, string> }): Promise<void>;
  /** One full stack update through the configured Pulumi driver. */
  update(stack: string): Promise<void>;
  rollout(argv: string[]): Promise<void>;
  verifyVersion(url: string, sha: string): Promise<boolean>;
  publishEntryFiles(opts: { distDir: string; bucket: string; region: string }): Promise<void>;
  /** The boot accounts of release `sha`, one per service that boots a machine of its own. */
  bootAccounts(opts: { mode: string; sha: string }): Promise<RunBootAccount[]>;
  /** Write a run's record and log to the environment's diagnostics bucket. */
  writeRunRecord(opts: { bucket: string; region: string; record: RunRecord; log: string }): Promise<void>;
  group(title: string): void;
  groupEnd(): void;
  info(msg: string): void;
}

interface RolloutRow {
  service: string;
  health_url: string;
}

/** The steps from which a release's machines have booted: their boot diagnostics say why one did not come up. */
const STEPS_WITH_MACHINES = new Set(['Base stack update', 'Waved rollout', 'Verify public versions', 'Smoke tests']);

/** What a failed deploy says last: the step it stopped at, and where to read the machines' boot accounts only when machines of the release booted. */
export function deployFailureHint(err: unknown, mode: string): { description: string; command?: string } {
  const step = (err as { deployStep?: string } | undefined)?.deployStep;
  const where = step ? `It stopped at "${step}". ` : '';
  if (step && !STEPS_WITH_MACHINES.has(step)) return { description: `${where}Re-running is safe: generations are content-addressed.` };
  return {
    description: `${where}Re-running is safe (generations are content-addressed). The run's record names each new machine's boot account, and Show runs prints a failed one:`,
    command: `pnpm infra runs --mode ${mode}`,
  };
}

export function parseDeployArgs(argv: string[]): DeployOptions {
  const mode = getFlag(argv, '--mode');
  const sha = getFlag(argv, '--sha');
  if (!mode || !sha) throw new Error('Usage: deploy.ts --mode <staging|production> --sha <git-sha>');
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`);
  return {
    mode,
    sha,
    run: getFlag(argv, '--run'),
  };
}

/** Derive the deploy env table from the app config for the requested mode. */
async function loadDeployEnvFromConfig(opts: DeployOptions): Promise<Record<AllowedKey, string>> {
  process.env.APP_MODE = opts.mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  if (appConfig.mode !== opts.mode) throw new Error(`Mode mismatch: requested "${opts.mode}" but loaded config is "${appConfig.mode}"`);
  return buildDeployEnv(appConfig, { imageTag: opts.sha });
}

export async function runDeploy(
  opts: DeployOptions,
  fx: DeployEffects,
  loadDeployEnv: (opts: DeployOptions) => Promise<Record<AllowedKey, string>> = loadDeployEnvFromConfig,
): Promise<void> {
  const env = await loadDeployEnv(opts);
  const stack = env.pulumi_stack;

  // The state backend reads AWS_* and region conventions; derived once here.
  adoptStateBackendEnv(env.region);

  // One run, one record (plan §3.8): written at the start, after every step and at the end, so a run killed at the job's limit still shows how far it came.
  const recorder = new RunRecorder({ run: opts.run ?? runId(opts.sha), environment: opts.mode, target: opts.sha });
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
  say(`[deploy] run ${recorder.record().run}: ${opts.sha} to ${opts.mode}`);
  await persist();
  await fx.initTelemetry({ mode: opts.mode, sha: opts.sha });
  const telemetry = deployTelemetry();
  const deploySpan = telemetry?.startSpan(`deploy ${opts.mode}`, { sha: opts.sha });
  // New generations bake this context into their boot plans, so VM boot spans join the deploy trace; the pulumi program inherits this env.
  if (deploySpan) process.env.TRACEPARENT = deploySpan.traceparent();
  telemetry?.event(deployEvents.started, { mode: opts.mode, sha: opts.sha });

  const step = async (title: string, run: () => void | Promise<void>): Promise<void> => {
    // A run whose lease another took must change nothing more: the other run holds the stack now.
    if (lease?.lost) throw new Error(`the stack lock was taken by another run before "${title}": this run stops`);
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
  let outcome: 'ok' | 'error' = 'ok';
  let failure: unknown;
  try {
    await step('Check Pulumi state bucket', () => fx.task('ensure-state-bucket', ['--check']));
    await step('Login to S3 state backend', () => fx.exec('pulumi', ['login', stateBackendUrl(env.state_bucket, env.region)]));
    await step('Select stack', () => fx.exec('pulumi', ['stack', 'select', stack]));
    await step('Acquire stack lock', async () => {
      lease = await fx.lease(stack, 'deploy');
    });
    await step('Pre-install Pulumi providers', () => fx.task('install-pulumi-providers'));
    // Under the lock, before anything plans the stack: drop pointers a failed deploy left behind, so neither the preflight nor the stack update
    // plans that release's generation again, and adopt the live VM as the overlap partner. The rollout rows name the services with a VM of their own;
    // every other service's pointers are dropped.
    const deployed = [...(JSON.parse(env.primary_rollout_matrix) as RolloutRow[]), ...(JSON.parse(env.roll_rest_matrix) as RolloutRow[])];
    await step('Reconcile rollout pointers', () =>
      fx.task('sync-rollout-config', ['--stack', stack, '--reset-pending', '--deployed', deployed.map((row) => row.service).join(',')]),
    );
    // Privileged changes (a database privilege, a VM policy rule) need an operator Apply first: fail here, in seconds, with that command.
    // The machine policies are written at Owner moments: a state that still holds them would have this update delete them.
    await step('Take retired resources out of the state', () => fx.task('forget-retired-resources', ['--stack', stack]));
    await step('Preflight privileged changes', () => fx.task('preflight-privileged', ['--stack', stack, '--mode', opts.mode]));
    await step("Check the deploy key's policy", () =>
      fx.task('assert-deploy-policy', [
        '--project-id',
        process.env.SCW_DEFAULT_PROJECT_ID ?? '',
        '--organization-id',
        process.env.SCW_DEFAULT_ORGANIZATION_ID ?? '',
      ]),
    );

    // The release's images and frontend files: a builder machine makes the missing ones, then the release's entry files wait in a folder of
    // their own for the publish below. No app code runs beside the deploy key.
    const distDir = env.frontend_bucket ? await mkdtemp(join(tmpdir(), 'release-')) : '';
    await step('Build the release', () =>
      fx.task('build-release', [
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
      ]),
    );

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

    // A stack that never had a machine plans its first generation in the base update below, before the rollout names one: it is this release.
    process.env.INFRA_RELEASE_SHA = opts.sha;

    // Stage the standing machine keys in hand-over bundles BEFORE the stack update bakes their references into cloud-init. No IAM write.
    await step('Stage machine keys', async () => {
      const { tmpdir } = await import('node:os');
      const outFile = resolve(tmpdir(), `generation-keys-${stack}-${opts.sha.slice(0, 10)}.json`);
      await fx.task('stage-generation-keys', ['--sha', opts.sha, '--out', outFile]);
      // The pulumi child (fx.update) inherits this env and bakes the boot key and handoff ids into the new generation's cloud-init.
      process.env.INFRA_GENERATION_KEYS_FILE = outFile;
    });

    await step('Base stack update', () => fx.update(stack));
    await step('Verify identity grants', async () => {
      // One assertion per principal: exact sets AND exact path condition. Their keys were checked when they were staged.
      const rows = JSON.parse(env.grant_rows_json) as Array<{ app: string; sets: string[]; condition: string }>;
      for (const row of rows) {
        await fx.task('assert-grants', [
          '--application-name',
          row.app,
          '--required-sets',
          row.sets.join(','),
          '--secret-condition',
          row.condition,
          '--project-id',
          process.env.SCW_DEFAULT_PROJECT_ID ?? '',
          '--organization-id',
          process.env.SCW_DEFAULT_ORGANIZATION_ID ?? '',
          ...(row.condition ? ['--project-scope'] : []),
        ]);
      }
    });
    // The deploy reads no value of the app's: the apply makes and moves values (ensure-secrets, ensure-database, copy-shared-secrets), and
    // this step checks from metadata that every copy a machine reads has one.
    await step('Verify runtime secrets are deliverable', () =>
      fx.task('assert-secrets-deliverable', [
        '--region',
        env.region,
        '--project-id',
        process.env.SCW_DEFAULT_PROJECT_ID ?? '',
        '--services-json',
        env.enabled_services_json,
        '--mode',
        opts.mode,
      ]),
    );

    try {
      await step('Waved rollout', () =>
        fx.rollout([
          '--stack',
          stack,
          '--sha',
          opts.sha,
          '--primary-json',
          env.primary_rollout_matrix,
          '--rest-json',
          env.roll_rest_matrix,
          // The displaced generations stay off every pool and are reaped last, once smoke passed.
          '--skip-reap',
        ]),
      );
    } catch (err) {
      telemetry?.event(deployEvents.rolloutFailed, { error: errorMessage(err) }, { severity: 'error' });
      say("[deploy] rollout failed; reading the release's boot accounts");
      const accounts = await fx.bootAccounts({ mode: opts.mode, sha: opts.sha }).catch((diagErr) => {
        say(`[deploy] the boot accounts could not be read: ${errorMessage(diagErr)}`);
        return undefined;
      });
      if (accounts) {
        recorder.boot(accounts);
        for (const account of accounts) {
          say(
            `[deploy] ${account.service}: ${account.key ? `${account.failed ? 'boot failed' : 'booted'} (${account.key})` : 'no account of this release: its boot runner has not finished'}`,
          );
        }
      }
      throw err;
    }

    await step('Verify public versions', async () => {
      // Every LB-exposed service, not just the VM-owning rollout rows: co-hosted and collocated followers are repointed by cutover without their own version probe.
      const rows: RolloutRow[] = JSON.parse(env.enabled_services_json);
      for (const row of rows) {
        if (!row.health_url) continue;
        const ok = await fx.verifyVersion(`${row.health_url.replace(/\/$/, '')}${healthContract.path}`, opts.sha);
        if (!ok) throw new Error(`Service '${row.service}' does not serve ${opts.sha}`);
      }
    });

    // Strictly after rollout verification, so users only load the new entry files once every service serves the new release. Skipped for a frontend-less registry.
    if (env.frontend_bucket) {
      await step('Publish frontend entry files', () => fx.publishEntryFiles({ distDir, bucket: env.frontend_bucket, region: env.region }));
    }
    await step('Smoke tests', () =>
      fx.task('smoke', [
        '--sha',
        opts.sha,
        '--services-json',
        env.enabled_services_json,
        // The primary-rollout service owns smoke's aggregate-health and OpenAPI checks, derived from the rollout matrix, with no service-name literal.
        ...((JSON.parse(env.primary_rollout_matrix) as RolloutRow[])[0]
          ? ['--primary', (JSON.parse(env.primary_rollout_matrix) as RolloutRow[])[0]!.service]
          : []),
        // A provided-but-unreadable --dist is a hard failure in smoke, so a frontend-less registry omits the flag.
        ...(env.frontend_bucket ? ['--dist', resolve(distDir, 'index.html')] : []),
      ]),
    );
    await step('Reap displaced generations', () => fx.update(stack));
  } catch (err) {
    outcome = 'error';
    failure = err;
    throw err;
  } finally {
    await lease?.release().catch((err) => say(`[deploy] lock release failed: ${errorMessage(err)}`));
    // A preflight that found an owed privileged change ends the run blocked, not failed: an apply comes first, then the same target.
    const blocked = failure instanceof ExitCodeError && failure.exitCode === 2;
    recorder.finish(outcome === 'ok' ? 'deployed' : blocked ? 'blocked' : 'failed', outcome === 'ok' ? undefined : errorMessage(failure));
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

/** The environment `exec` hands a child: the deploy's own, with `env` layered on top. */
export function execEnv(parentEnv: NodeJS.ProcessEnv, opts: { env?: Record<string, string> }): NodeJS.ProcessEnv {
  return opts.env ? { ...parentEnv, ...opts.env } : parentEnv;
}

// Real effects: subprocesses in the infra dir, S3 entry publish, log grouping. Every ordering and failure decision lives in runDeploy.

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
  const { run } = opts.record;
  await s3.send(
    new PutObjectCommand({
      Bucket: opts.bucket,
      Key: runRecordKey(run),
      Body: JSON.stringify(opts.record, null, 2),
      ContentType: 'application/json',
    }),
  );
  await s3.send(new PutObjectCommand({ Bucket: opts.bucket, Key: runLogKey(run), Body: opts.log, ContentType: 'text/plain; charset=utf-8' }));
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
  'ensure-state-bucket': async (argv) => (await import('./ensure-state-bucket')).main(argv),
  'install-pulumi-providers': async () => (await import('./install-pulumi-providers')).main(),
  'forget-retired-resources': async (argv) => (await import('./forget-retired-resources')).main(argv),
  'preflight-privileged': async (argv) => (await import('./preflight-privileged')).main(argv),
  'sync-rollout-config': async (argv) => (await import('./sync-rollout-config')).syncRolloutConfig(argv),
  'stage-generation-keys': async (argv) => (await import('./stage-generation-keys')).main(argv),
  'build-release': async (argv) => (await import('./build-release')).main(argv),
  'assert-grants': async (argv) => (await import('./assert-grants')).main(argv),
  'assert-deploy-policy': async (argv) => (await import('./assert-deploy-policy')).main(argv),
  'assert-secrets-deliverable': async (argv) => (await import('./assert-secrets-deliverable')).main(argv),
  'geoip-refresh': async (argv) => (await import('./geoip-refresh')).main(argv),
  smoke: async (argv) => (await import('./smoke')).main(argv),
};

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
      if (!config) console.info('[deploy] telemetry export disabled (no OTLP endpoint or ingest key); black box only');
      initDeployTelemetry({
        mode,
        sha,
        endpoint: config?.endpoint,
        headers: config?.headers,
        onError: (message) => console.warn(`[deploy] ${message}`),
      });
    },
    task: (name, argv = []) => taskRunners[name](argv),
    async lease(stack, operation) {
      const [{ controlActor, controlContextForStack }, { acquireLease, installSignalRelease }] = await Promise.all([
        import('../lib/stack/control-store'),
        import('../lib/stack/stack-lease'),
      ]);
      const ctx = await controlContextForStack(stack);
      if (!ctx) throw new Error('stack lease: SCW_ACCESS_KEY/SCW_SECRET_KEY (or AWS_*) required');
      // A CI run queues behind another deploy for a while; a dead holder's lease lapses within its lifetime.
      const result = await acquireLease({
        s3: ctx.s3,
        bucket: ctx.bucket,
        key: ctx.lockKey,
        owner: controlActor(),
        operation,
        ttlMs: 5 * 60_000,
        renewEveryMs: 60_000,
        waitMs: 10 * 60_000,
        pollMs: 15_000,
        onWait: (held, remainingMs) =>
          console.info(
            `[${operation}] stack locked by ${held.owner} (${held.operation}, since ${held.acquiredAt}); waiting up to ${Math.ceil(remainingMs / 60_000)} min`,
          ),
        onRenewFailed: (reason, lost) => console.warn(`[${operation}] lease renewal failed: ${reason}${lost ? ' (lock lost)' : ''}`),
      });
      if (!result.acquired) {
        throw new Error(
          `stack ${stack} is locked by ${result.held.owner} (operation: ${result.held.operation}, since ${result.held.acquiredAt}). If that run is dead, clear it with \`${actionCommand('unlock')}\`.`,
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
    exec(cmd, args, opts = {}) {
      // spawn, not spawnSync: a synchronous child blocks the event loop, and with it the stack lease's renewal.
      return new Promise((done, fail) => {
        const child = spawn(cmd, args, {
          cwd: infraDir,
          env: execEnv(process.env, opts),
          stdio: [opts.stdin === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
        });
        if (opts.stdin !== undefined) child.stdin?.end(opts.stdin);
        child.once('error', (err) => {
          if (opts.allowFailure) done();
          else fail(new Error(`${cmd} ${args[0] ?? ''} failed to start: ${errorMessage(err)}`));
        });
        child.once('close', (status) => {
          if (status !== 0 && !opts.allowFailure) fail(new Error(`${cmd} ${args[0] ?? ''} failed with exit ${status}`));
          else done();
        });
      });
    },
    update: async (stack) => {
      const { createPulumiDriver } = await import('../lib/stack/pulumi-driver');
      await createPulumiDriver(stack).update();
    },
    rollout: (argv) => runWavedRolloutCli(argv),
    async verifyVersion(url, sha) {
      const out = await pollForVersion({ url, expectedSha: sha, probe: createFetchProbe(8000), attempts: 40, intervalMs: 3000 });
      return out.ok;
    },
    publishEntryFiles: publishEntryFilesToBucket,
    writeRunRecord: writeRunRecordToBucket,
    async bootAccounts({ sha }) {
      const [{ bucketBootAccountReader, releaseAccounts }, { loadEngineConfig }, { deriveInfra }, { deployedServices }, { projectAccessKey }] =
        await Promise.all([
          import('../lib/deploy/boot-accounts'),
          import('../config/engine-config'),
          import('../lib/naming'),
          import('../lib/services'),
          import('../lib/scaleway/s3-client'),
        ]);
      const appConfig = await loadEngineConfig();
      const { naming, region } = deriveInfra(appConfig);
      const { accessKey, secretKey } = deployS3Key();
      const s3 = await makeS3Client(region, projectAccessKey(accessKey, process.env.SCW_DEFAULT_PROJECT_ID ?? ''), secretKey);
      // Only services that boot a machine of their own give an account: under singleVM, the host alone.
      const services = deployedServices(appConfig.services, appConfig.singleVM).map((service) => service.slug);
      return (await releaseAccounts(bucketBootAccountReader(s3, naming.bootDiagBucket), services, sha)).map(({ service, account }) =>
        account ? { service, key: account.key, failed: account.failed } : { service },
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
