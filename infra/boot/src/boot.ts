import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { bootEvents } from '../../lib/telemetry/deploy-telemetry';
import { createTelemetry, type Telemetry } from '../../lib/telemetry/emitter';
import { errorMessage } from '../../lib/utils/errors';
import { retry } from '../../lib/utils/retry';
import { scrubSecretLines, uploadBootDiagnostics } from './diagnostics';
import { type ExecFn, execCommand, mustExec } from './exec';
import { createJsonLogger } from './logger';
import { type BootPlan, parseBootPlanJson } from './plan';
import { hydrateRuntimeSecrets } from './runtime-secrets';
import { fetchServiceKey } from './service-key';

/** Seconds to wait for the started container to become healthy before failing the boot. */
const startupTimeoutSeconds = 120;

export interface BootOptions {
  planPath: string;
  exec?: ExecFn;
}

export interface WaitForPrivateNetworkOptions {
  exec: ExecFn;
  timeoutSeconds: number;
  retryDelayMs?: number;
}

async function writeFileMode(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, 'utf-8');
  await chmod(path, mode);
}

async function readCredential(path: string): Promise<string> {
  return (await readFile(path, 'utf-8')).trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPrivateNetwork(opts: WaitForPrivateNetworkOptions): Promise<void> {
  const retryDelayMs = opts.retryDelayMs ?? 1000;
  const deadline = Date.now() + opts.timeoutSeconds * 1000;

  while (Date.now() <= deadline) {
    // Two-step probe: a private-network route must exist, and an IPv4 address
    // in the 10.0.0.0/8 range must be assigned.
    const route = await opts.exec('ip', ['route', 'get', '10.0.0.1']);
    if (route.code === 0) {
      const addresses = await opts.exec('ip', ['-4', 'addr', 'show']);
      if (addresses.code === 0 && addresses.stdout.includes('10.0.')) return;
    }
    await sleep(retryDelayMs);
  }

  throw new Error(`private network did not become ready within ${opts.timeoutSeconds}s`);
}

async function writeAppFiles(plan: BootPlan): Promise<void> {
  await writeFileMode(plan.docker.composeFile, plan.files.compose, 0o600);
  await writeFileMode('/opt/app/.env', plan.files.env, 0o600);
  await writeFileMode(
    '/etc/runtime-secrets/manifest.json',
    JSON.stringify(plan.files.runtimeSecretManifest, null, 2),
    0o600,
  );
}

async function dockerLogin(plan: BootPlan, secretKey: string, exec: ExecFn): Promise<void> {
  const [registryHost = ''] = plan.registry.split('/');
  await mustExec(exec, 'docker', ['login', registryHost, '-u', 'nologin', '--password-stdin'], { input: secretKey });
}

/** Compose services this VM runs: explicit names (plans written before container collocation carry none). */
function startServices(plan: BootPlan): [string, ...string[]] {
  return plan.services ?? [plan.profile];
}

async function pullImage(plan: BootPlan, exec: ExecFn): Promise<void> {
  await retry(
    () =>
      mustExec(exec, 'docker', ['compose', '--profile', plan.profile, 'pull', ...startServices(plan)], {
        cwd: '/opt/app',
      }),
    {
      attempts: plan.timeouts.pullAttempts,
      delayMs: plan.timeouts.pullRetrySeconds * 1000,
    },
  );
}

async function runReleaseCommand(plan: BootPlan, exec: ExecFn): Promise<void> {
  if (!plan.releaseCommand.enabled) return;
  const [command, ...args] = plan.releaseCommand.command;
  await mustExec(exec, command, args, { cwd: '/opt/app' });
}

/**
 * Start the app (and any collocated containers) and wait for the compose
 * healthchecks. `--wait` blocks until every started container is healthy.
 * Explicitly naming a service activates its profile, so collocated containers
 * outside the host profile start too.
 */
async function startService(plan: BootPlan, exec: ExecFn): Promise<void> {
  await mustExec(
    exec,
    'docker',
    [
      'compose',
      '--profile',
      plan.profile,
      'up',
      '-d',
      '--wait',
      '--wait-timeout',
      String(startupTimeoutSeconds),
      ...startServices(plan),
    ],
    { cwd: '/opt/app' },
  );
}

/** Best-effort tail of the app container's own stdout/stderr for diagnostics,
 *  secret-scrubbed at capture so every downstream sink (telemetry event body,
 *  boot-diag upload) only ever sees the scrubbed form. */
async function captureServiceLogs(plan: BootPlan, exec: ExecFn): Promise<string> {
  const res = await exec(
    'docker',
    ['compose', '--profile', plan.profile, 'logs', '--no-color', '--tail', '200', ...startServices(plan)],
    { cwd: '/opt/app' },
  );
  return scrubSecretLines((res.stdout || res.stderr || '').trim());
}

/** Read the plan-declared ingest-key env var from the hydrated runtime env file, if delivered. */
async function sinkKeyFromRuntimeEnv(path: string, keyEnvVar: string): Promise<string | undefined> {
  const content = await readFile(path, 'utf-8').catch(() => '');
  const line = content.split('\n').find((entry) => entry.startsWith(`${keyEnvVar}=`));
  const value = line?.slice(line.indexOf('=') + 1).trim();
  return value || undefined;
}

export async function boot(opts: BootOptions): Promise<void> {
  const exec = opts.exec ?? execCommand;
  const plan = parseBootPlanJson(await readFile(opts.planPath, 'utf-8'));
  const logger = createJsonLogger({ service: plan.service, release: plan.releaseSha });
  const accessKey = await readCredential(plan.credentials.scwAccessKeyFile);
  const secretKey = await readCredential(plan.credentials.scwSecretKeyFile);
  // Build-only until secret hydration delivers an ingest key; every record
  // lands in the black-box JSONL either way, joined to the deploy trace.
  const telemetry: Telemetry = createTelemetry({
    resource: { 'service.name': 'infra-boot', 'app.service': plan.service, 'vcs.ref.head.revision': plan.releaseSha },
    traceparent: plan.traceparent,
    onError: (message) => logger.log('warn', 'telemetry-export-failed', { message }),
  });
  const bootSpan = telemetry.startSpan(`boot ${plan.service}`, { service: plan.service, sha: plan.releaseSha });
  telemetry.event(bootEvents.started, { service: plan.service, sha: plan.releaseSha });
  const phase = async (step: string, run: () => Promise<unknown>): Promise<void> => {
    logger.log('info', step);
    const startedAt = Date.now();
    try {
      await run();
    } catch (err) {
      telemetry.event(
        bootEvents.stepFailed,
        { service: plan.service, step, error: errorMessage(err) },
        { severity: 'error', ctx: bootSpan.ctx },
      );
      throw err;
    }
    telemetry.event(
      bootEvents.stepCompleted,
      { service: plan.service, step, duration_s: Math.round((Date.now() - startedAt) / 1000) },
      { ctx: bootSpan.ctx },
    );
  };
  let bootRc = 0;
  let appLogs: string | undefined;

  try {
    await phase('wait-private-network', () =>
      waitForPrivateNetwork({ exec, timeoutSeconds: plan.timeouts.privateNetworkSeconds }),
    );
    await phase('write-app-files', () => writeAppFiles(plan));
    await phase('docker-login', () => dockerLogin(plan, secretKey, exec));
    // v2: swap the baked boot key for the real service key via the
    // single-access handoff bundle (cache-first on reboots; a consumed bundle
    // on first boot = interception → this phase throws and the boot halts).
    let serviceKey = { accessKey, secretKey };
    if (plan.serviceKeyHandoff) {
      await phase('fetch-service-key', async () => {
        serviceKey = await fetchServiceKey({
          handoff: plan.serviceKeyHandoff!,
          bootSecretKey: secretKey,
          region: plan.region,
        });
      });
    }
    await phase('hydrate-runtime-secrets', () =>
      hydrateRuntimeSecrets({
        manifest: plan.files.runtimeSecretManifest,
        secretKey: serviceKey.secretKey,
        region: plan.region,
        outputPath: '/opt/app/.env.runtime',
        // REQ-20: the backend signs S3 requests with its own service key.
        extraLines: plan.exportS3Env
          ? [`S3_ACCESS_KEY_ID=${serviceKey.accessKey}`, `S3_ACCESS_KEY_SECRET=${serviceKey.secretKey}`]
          : [],
      }),
    );
    // Export only where the plan declares a sink (config/telemetry.config.ts
    // on the engine side); no vendor endpoint is baked into the boot runner.
    const sink = plan.telemetry;
    const sinkKey = sink ? await sinkKeyFromRuntimeEnv('/opt/app/.env.runtime', sink.keyEnvVar) : undefined;
    if (sink && sinkKey)
      telemetry.configureExport({
        endpoint: sink.endpoint,
        headers: { [sink.keyHeader]: sinkKey },
      });
    await phase('pull-image', () => pullImage(plan, exec));
    await phase('release-command', () => runReleaseCommand(plan, exec));
    await phase('start-service', () => startService(plan, exec));
    logger.log('info', 'boot-complete');
    bootSpan.end('ok');
    telemetry.event(bootEvents.completed, { service: plan.service, sha: plan.releaseSha });
  } catch (err) {
    bootRc = 1;
    logger.log('error', 'boot-failed', { message: errorMessage(err) });
    // The boot runner runs containerized without the host boot log mounted, so capture
    // the crashed container's own output here to ship it with the diagnostics.
    appLogs = await captureServiceLogs(plan, exec).catch(() => undefined);
    bootSpan.end('error', { message: errorMessage(err) });
    const failureBody = [
      `boot.failed service=${plan.service} sha=${plan.releaseSha} error=${errorMessage(err)}`,
      appLogs ? `--- app log tail ---\n${appLogs.slice(-4000)}` : '',
    ]
      .filter(Boolean)
      .join('\n');
    telemetry.event(
      bootEvents.failed,
      { service: plan.service, sha: plan.releaseSha, error: errorMessage(err) },
      { severity: 'error', body: failureBody },
    );
    throw err;
  } finally {
    await telemetry.flush().catch(() => {});
    try {
      await uploadBootDiagnostics({
        bucket: plan.bootDiagnostics.bucket,
        region: plan.region,
        accessKey,
        secretKey,
        service: plan.service,
        releaseSha: plan.releaseSha,
        bootRc,
        logFile: plan.bootDiagnostics.logFile,
        appLogs,
        events: telemetry.eventsJsonl(),
      });
    } catch (err) {
      logger.log('warn', 'boot-diagnostics-upload-failed', { message: errorMessage(err) });
    }
  }
}
