import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { healthContract } from '../config/health.config';
import { deployEvents, deployTelemetry, initDeployTelemetry } from '../lib/telemetry/deploy-telemetry';
import { otlpConfigFromEnv } from '../lib/telemetry/emitter';
import { errorMessage } from '../lib/utils/errors';
import { isMain } from '../lib/utils/is-main';
import { infraDir } from '../lib/utils/paths';
import { getFlag } from './args';
import { bakeDefinition, parseBuildRows } from './build-images';
import { main as runWavedRolloutCli } from './deploy-rollout';
import { type AllowedKey, buildDeployEnv, isAllowedProductionRef } from './print-deploy-env';
import { frontendBuildEnv } from './print-frontend-build-env';
import { createFetchProbe, pollForVersion } from './wait-for-version';

/**
 * The whole deploy after image builds, as ONE command: preflights, stack lock,
 * base stack update, waved rollout, public version verification, atomic
 * frontend entry publish, smoke checks, boot diagnostics on failure. CI
 * (.github/workflows/deploy.yml) is a thin trigger around this; any CI system
 * (or an operator shell) that provides the SCW_* credentials can run it.
 */
export interface DeployOptions {
  mode: string;
  sha: string;
  /** Prebuilt frontend dist directory. Absent = the command builds the frontend itself. */
  distDir?: string;
  /** Build + push all images in-process (buildx bake) before waiting on the registry. */
  build?: boolean;
  /** CI ref for the production trust gate; local operator runs may omit it. */
  gitRef?: string;
}

/** Deploy step tasks runnable in-process (tasks/<name>.ts, main(argv) throws on failure). */
export type TaskName =
  | 'ensure-state-bucket'
  | 'stack-lock'
  | 'install-pulumi-providers'
  | 'wait-for-images'
  | 'repair-certs'
  | 'sync-rollout-config'
  | 'mint-generation-keys'
  | 'assert-vm-grants'
  | 'assert-secrets-deliverable'
  | 'smoke';

/** One executed step. Steps run in-process via `task`; `exec` remains for
 *  genuinely external binaries (pulumi login/select, docker login). */
export interface DeployEffects {
  /** Create the deploy emitter (OTLP config resolution may hit Secret Manager). */
  initTelemetry(init: { mode: string; sha: string }): Promise<void>;
  /** Run a task module's main(argv) in-process; throws on failure. */
  task(name: TaskName, argv?: string[]): Promise<void>;
  /** Run an external binary in the infra dir; throws on non-zero exit unless allowFailure. */
  exec(
    cmd: string,
    args: string[],
    opts?: { allowFailure?: boolean; stdin?: string; env?: Record<string, string> },
  ): void;
  /** Upload the built frontend bundle (hashed assets skip when present; entry files excluded). */
  uploadAssets(opts: { distDir: string; bucket: string; region: string }): Promise<void>;
  /** One full stack update through the configured Pulumi driver. */
  update(stack: string): Promise<void>;
  rollout(argv: string[]): Promise<void>;
  verifyVersion(url: string, sha: string): Promise<boolean>;
  publishEntryFiles(opts: { distDir: string; bucket: string; region: string }): Promise<void>;
  bootDiagnostics(sinceIso?: string): Promise<void>;
  group(title: string): void;
  groupEnd(): void;
  info(msg: string): void;
}

interface RolloutRow {
  service: string;
  health_url: string;
}

export function parseDeployArgs(argv: string[]): DeployOptions {
  const mode = getFlag(argv, '--mode');
  const sha = getFlag(argv, '--sha');
  if (!mode || !sha)
    throw new Error('Usage: deploy.ts --mode <staging|production> --sha <git-sha> [--dist <dir>] [--git-ref <ref>]');
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`);
  return {
    mode,
    sha,
    distDir: getFlag(argv, '--dist'),
    build: argv.includes('--build'),
    gitRef: getFlag(argv, '--git-ref'),
  };
}

/** Derive the deploy env table from the app config for the requested mode. */
async function loadDeployEnvFromConfig(opts: DeployOptions): Promise<Record<AllowedKey, string>> {
  process.env.APP_MODE = opts.mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const appConfig = await loadEngineConfig();
  if (appConfig.mode !== opts.mode)
    throw new Error(`Mode mismatch: requested "${opts.mode}" but loaded config is "${appConfig.mode}"`);
  return buildDeployEnv(appConfig, { imageTag: opts.sha });
}

export async function runDeploy(
  opts: DeployOptions,
  fx: DeployEffects,
  loadDeployEnv: (opts: DeployOptions) => Promise<Record<AllowedKey, string>> = loadDeployEnvFromConfig,
): Promise<void> {
  if (opts.mode === 'production' && opts.gitRef && !isAllowedProductionRef(opts.gitRef)) {
    throw new Error(`Production deploys are only allowed from the main branch or a release tag (got ${opts.gitRef})`);
  }

  const env = await loadDeployEnv(opts);
  const stack = env.pulumi_stack;

  // Downstream tools read AWS_*/region conventions; derive them once here.
  process.env.AWS_ACCESS_KEY_ID ??= process.env.SCW_ACCESS_KEY ?? '';
  process.env.AWS_SECRET_ACCESS_KEY ??= process.env.SCW_SECRET_KEY ?? '';
  // The aws CLI (diag's S3 reader) refuses to run without a region.
  process.env.AWS_DEFAULT_REGION ??= env.region;
  process.env.SCW_DEFAULT_REGION ??= env.region;

  const startedAtIso = new Date().toISOString();
  await fx.initTelemetry({ mode: opts.mode, sha: opts.sha });
  const telemetry = deployTelemetry();
  const deploySpan = telemetry?.startSpan(`deploy ${opts.mode}`, { sha: opts.sha });
  // New generations bake this context into their boot plans, so VM boot
  // spans join the deploy trace (the pulumi program inherits this env).
  if (deploySpan) process.env.TRACEPARENT = deploySpan.traceparent();
  telemetry?.event(deployEvents.started, { mode: opts.mode, sha: opts.sha });

  const step = async (title: string, run: () => void | Promise<void>): Promise<void> => {
    fx.group(title);
    const span = telemetry?.startSpan(title, { step: title }, deploySpan?.ctx);
    const startedAt = Date.now();
    try {
      await run();
      const seconds = Math.round((Date.now() - startedAt) / 1000);
      span?.end('ok');
      telemetry?.event(deployEvents.stepCompleted, { step: title, duration_s: seconds }, { ctx: span?.ctx });
      fx.info(`[deploy] ${title}: ok (${seconds}s)`);
    } catch (err) {
      span?.end('error', { message: errorMessage(err) });
      const failAttrs: { step: string; error: string; 'error.stack'?: string } = {
        step: title,
        error: errorMessage(err),
      };
      if (err instanceof Error && err.stack) failAttrs['error.stack'] = err.stack.slice(0, 4000);
      telemetry?.event(deployEvents.stepFailed, failAttrs, { severity: 'error', ctx: span?.ctx });
      throw err;
    } finally {
      fx.groupEnd();
    }
  };

  let lockHeld = false;
  let outcome: 'ok' | 'error' = 'ok';
  try {
    await step('Ensure Pulumi state bucket', () => fx.task('ensure-state-bucket'));
    await step('Login to S3 state backend', () =>
      fx.exec('pulumi', ['login', `s3://${env.state_bucket}?endpoint=s3.${env.region}.scw.cloud&region=${env.region}`]),
    );
    await step('Select stack', () => fx.exec('pulumi', ['stack', 'select', stack]));
    await step('Acquire stack lock', async () => {
      await fx.task('stack-lock', ['acquire', '--stack', stack, '--operation', 'deploy', '--ttl-min', '60']);
      lockHeld = true;
    });
    await step('Pre-install Pulumi providers', () => fx.task('install-pulumi-providers'));

    const registry = `rg.${env.region}.scw.cloud`;
    await step('Login to container registry', () =>
      fx.exec('docker', ['login', registry, '-u', 'nologin', '--password-stdin'], {
        stdin: process.env.SCW_SECRET_KEY ?? '',
      }),
    );

    // Images and frontend converge concurrently: the image path builds (with
    // --build) or waits for CI's registry pushes; the frontend path builds the
    // bundle (unless --dist provided prebuilt) and uploads hashed assets.
    // Entry files stay out until after version verification below.
    const distDir = opts.distDir ?? resolve(infraDir, '..', 'frontend', 'dist');
    const imagesReady = (async () => {
      if (opts.build) {
        await step('Build images (buildx bake)', () => {
          const bake = bakeDefinition(parseBuildRows(env.build_images_matrix), {
            registry,
            namespace: env.registry_ns,
            tag: opts.sha,
            context: '..',
          });
          fx.exec('pnpm', ['run', 'boot:build']);
          fx.exec('docker', ['buildx', 'bake', '--file', '-', '--push'], { stdin: JSON.stringify(bake) });
        });
      }
      await step('Wait for image tags in registry', () =>
        fx.task('wait-for-images', [
          '--registry',
          registry,
          '--ns',
          env.registry_ns,
          '--tag',
          opts.sha,
          '--build-images-json',
          env.build_images_matrix,
        ]),
      );
    })();
    const frontendReady = (async () => {
      // No SPA bucket (frontend-less registry): nothing to build or upload.
      if (!env.frontend_bucket) return;
      if (!opts.distDir) {
        await step('Build frontend', () =>
          fx.exec('pnpm', ['--filter', 'frontend', 'build'], {
            env: { ...frontendBuildEnv(opts.mode, env.enabled_services_json) },
          }),
        );
      }
      await step('Upload frontend assets', () =>
        fx.uploadAssets({ distDir, bucket: env.frontend_bucket, region: env.region }),
      );
    })();
    const [imagesOutcome, frontendOutcome] = await Promise.allSettled([imagesReady, frontendReady]);
    for (const settled of [imagesOutcome, frontendOutcome]) {
      if (settled.status === 'rejected') throw settled.reason;
    }

    // Mint this generation's keys + handoff bundles BEFORE the stack update
    // bakes their references into cloud-init.
    await step('Mint generation keys', async () => {
      const { tmpdir } = await import('node:os');
      const outFile = resolve(tmpdir(), `generation-keys-${stack}-${opts.sha.slice(0, 10)}.json`);
      await fx.task('mint-generation-keys', ['--sha', opts.sha, '--out', outFile]);
      // The pulumi child (fx.update) inherits this env and bakes the boot
      // key + handoff ids into the new generation's cloud-init.
      process.env.INFRA_GENERATION_KEYS_FILE = outFile;
    });

    await step('Repair errored LB certificates', () => fx.task('repair-certs', ['--stack', stack]));
    await step('Base stack update', async () => {
      await fx.task('sync-rollout-config', ['--stack', stack]);
      await fx.update(stack);
    });
    await step('Verify VM IAM grants', async () => {
      // One assertion per principal: exact sets AND exact path condition.
      const rows = JSON.parse(env.vm_assert_json) as Array<{ app: string; sets: string[]; condition: string }>;
      for (const row of rows) {
        await fx.task('assert-vm-grants', [
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
        ]);
      }
    });
    await step('Verify runtime secrets are deliverable', () =>
      fx.task('assert-secrets-deliverable', [
        '--region',
        env.region,
        '--project-id',
        process.env.SCW_DEFAULT_PROJECT_ID ?? '',
        '--services-json',
        env.enabled_services_json,
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
        ]),
      );
    } catch (err) {
      telemetry?.event(deployEvents.rolloutFailed, { error: errorMessage(err) }, { severity: 'error' });
      fx.info('[deploy] rollout failed; collecting boot diagnostics');
      await fx
        .bootDiagnostics(startedAtIso)
        .catch((diagErr) => fx.info(`[deploy] boot diagnostics failed: ${errorMessage(diagErr)}`));
      throw err;
    }

    await step('Verify public versions', async () => {
      // Every LB-exposed service, not just the VM-owning rollout rows:
      // co-hosted and collocated followers are repointed by cutover without
      // their own version probe, so they gate here too, before the new entry
      // files publish.
      const rows: RolloutRow[] = JSON.parse(env.enabled_services_json);
      for (const row of rows) {
        if (!row.health_url) continue;
        const ok = await fx.verifyVersion(`${row.health_url.replace(/\/$/, '')}${healthContract.path}`, opts.sha);
        if (!ok) throw new Error(`Service '${row.service}' does not serve ${opts.sha}`);
      }
    });

    // Strictly after rollout verification: users only load the new entry
    // files once every service already serves the new release. Skipped for a
    // frontend-less registry (no SPA bucket).
    if (env.frontend_bucket) {
      await step('Publish frontend entry files', () =>
        fx.publishEntryFiles({ distDir, bucket: env.frontend_bucket, region: env.region }),
      );
    }
    await step('Smoke tests', () =>
      fx.task('smoke', [
        '--sha',
        opts.sha,
        '--services-json',
        env.enabled_services_json,
        // A provided-but-unreadable --dist is a hard failure in smoke, so a
        // frontend-less registry omits it instead of pointing at nothing.
        ...(env.frontend_bucket ? ['--dist', resolve(distDir, 'index.html')] : []),
      ]),
    );
  } catch (err) {
    outcome = 'error';
    throw err;
  } finally {
    if (lockHeld) {
      await fx
        .task('stack-lock', ['release', '--stack', stack])
        .catch((err) => fx.info(`[deploy] lock release failed: ${errorMessage(err)}`));
    }
    deploySpan?.end(outcome);
    telemetry?.event(
      outcome === 'ok' ? deployEvents.completed : deployEvents.failed,
      { mode: opts.mode, sha: opts.sha },
      outcome === 'ok' ? {} : { severity: 'error' },
    );
    await telemetry?.flush();
  }
}

// Real effects: subprocesses in the infra dir, S3 entry publish, GitHub-aware
// log grouping. Kept thin; every ordering/failure decision lives in runDeploy.

const ENTRY_FILES: Array<{ name: string; contentType: string }> = [
  { name: 'index.html', contentType: 'text/html; charset=utf-8' },
  { name: 'sw.js', contentType: 'text/javascript; charset=utf-8' },
  { name: 'manifest.webmanifest', contentType: 'application/manifest+json' },
];

async function publishEntryFilesToBucket(opts: { distDir: string; bucket: string; region: string }): Promise<void> {
  const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({
    region: opts.region,
    endpoint: `https://s3.${opts.region}.scw.cloud`,
    credentials: {
      accessKeyId: process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY ?? '',
    },
    forcePathStyle: false,
  });
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

// Each task stays an independent CLI (tsx tasks/<name>.ts) for operators; the
// deploy runs the same mains in-process, so one node process reads config once
// and a failing step surfaces with its full stack trace.
const taskRunners: Record<TaskName, (argv: string[]) => Promise<void>> = {
  'ensure-state-bucket': async () => (await import('./ensure-state-bucket')).main(),
  'stack-lock': async (argv) => (await import('./stack-lock')).main(argv),
  'install-pulumi-providers': async () => (await import('./install-pulumi-providers')).main(),
  'wait-for-images': async (argv) => (await import('./wait-for-images')).main(argv),
  'repair-certs': async (argv) => (await import('./repair-certs')).main(argv),
  'sync-rollout-config': async (argv) => (await import('./sync-rollout-config')).syncRolloutConfig(argv),
  'mint-generation-keys': async (argv) => (await import('./mint-generation-keys')).main(argv),
  'assert-vm-grants': async (argv) => (await import('./assert-vm-grants')).main(argv),
  'assert-secrets-deliverable': async (argv) => (await import('./assert-secrets-deliverable')).main(argv),
  smoke: async (argv) => (await import('./smoke')).main(argv),
};

function createRealEffects(): DeployEffects {
  const inActions = Boolean(process.env.GITHUB_ACTIONS);
  return {
    async initTelemetry({ mode, sha }) {
      let config = otlpConfigFromEnv();
      if (!config) {
        const [{ sinkIngestKeyFromSecretManager }, { telemetrySink }] = await Promise.all([
          import('../lib/telemetry/sink-key'),
          import('../config/telemetry.config'),
        ]);
        const key = await sinkIngestKeyFromSecretManager().catch((err) => {
          console.warn(`[deploy] telemetry ingest key lookup failed: ${errorMessage(err)}`);
          return undefined;
        });
        if (key) {
          config = { endpoint: telemetrySink.endpoint, headers: { [telemetrySink.keyHeader]: key } };
          // In-process consumers (black-box replay on failure) resolve via env.
          process.env[telemetrySink.keyEnvVar] ??= key;
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
    exec(cmd, args, opts = {}) {
      const res = spawnSync(cmd, args, {
        cwd: infraDir,
        env: opts.env ? { ...process.env, ...opts.env } : process.env,
        stdio: [opts.stdin === undefined ? 'inherit' : 'pipe', 'inherit', 'inherit'],
        input: opts.stdin,
      });
      if (res.status !== 0 && !opts.allowFailure)
        throw new Error(`${cmd} ${args[0] ?? ''} failed with exit ${res.status}`);
    },
    async uploadAssets(assetOpts) {
      const { uploadFrontendAssets } = await import('./frontend-assets');
      await uploadFrontendAssets(assetOpts);
    },
    update: async (stack) => {
      const { createPulumiDriver } = await import('../lib/stack/pulumi-driver');
      await createPulumiDriver(stack).update();
    },
    rollout: (argv) => runWavedRolloutCli(argv),
    async verifyVersion(url, sha) {
      const out = await pollForVersion({
        url,
        expectedSha: sha,
        probe: createFetchProbe(8000),
        attempts: 40,
        intervalMs: 3000,
      });
      return out.ok;
    },
    publishEntryFiles: publishEntryFilesToBucket,
    async bootDiagnostics(sinceIso) {
      const { main: diag } = await import('./diag');
      await diag([]);
      // Re-ship black-box events from VMs that died before their exporter was
      // configured (pre-hydration failures); best-effort like all telemetry.
      await diag(['--replay', ...(sinceIso ? ['--since', sinceIso] : [])]).catch((err) => {
        console.warn(`[deploy] black-box replay failed: ${err instanceof Error ? err.message : String(err)}`);
      });
    },
    group: (title) => console.info(inActions ? `::group::${title}` : `\n=== ${title} ===`),
    groupEnd: () => {
      if (inActions) console.info('::endgroup::');
    },
    info: (msg) => console.info(msg),
  };
}

/** Entry called by tasks/deploy.ts once APP_MODE is set (imports here evaluate shared). */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  await runDeploy(parseDeployArgs(argv), createRealEffects());
}

if (isMain(import.meta.url)) {
  main().catch((err) => {
    console.error(errorMessage(err));
    process.exit(1);
  });
}
