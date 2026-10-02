import { readFile } from 'node:fs/promises';
import { bootEvents } from '../../lib/telemetry/deploy-telemetry';
import { createTelemetry, type Telemetry } from '../../lib/telemetry/emitter';
import { errorMessage } from '../../lib/utils/errors';
import { retry } from '../../lib/utils/retry';
import { scrubSecretLines, uploadBootDiagnostics } from './diagnostics';
import { type ExecFn, execCommand, mustExec } from './exec';
import { writeFileMode } from './fs-utils';
import { createJsonLogger } from './logger';
import { type BootPlan, parseBootPlanJson } from './plan';
import { hydrateRuntimeSecrets } from './runtime-secrets';
import { createSecretRedactor } from './secret-redactor';
import { fetchServiceKey } from './service-key';

/** Seconds to wait for the started container to become healthy before failing the boot. */
const startupTimeoutSeconds = 120;

/** Ceiling on one `docker compose pull` attempt: a stalled transfer is killed and retried. A cold pull of the backend image takes well under a minute. */
const pullAttemptTimeoutSeconds = 240;

/** Ceiling on the quick docker calls (registry login, log capture, container cleanup). */
const dockerCallTimeoutSeconds = 60;

/** Seconds between heartbeats of a running phase: an event and a flush each, so a stuck phase shows up live in the telemetry sink. */
const heartbeatSeconds = 30;

/** Output lines per phase exported as telemetry records; the console and the boot log keep every line. */
const outputLinesPerPhase = 200;

export interface BootOptions {
  planPath: string;
  exec?: ExecFn;
}

export interface WaitForPrivateNetworkOptions {
  exec: ExecFn;
  timeoutSeconds: number;
  retryDelayMs?: number;
}

async function readKeyFile(path: string): Promise<string> {
  return (await readFile(path, 'utf-8')).trim();
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function waitForPrivateNetwork(opts: WaitForPrivateNetworkOptions): Promise<void> {
  const retryDelayMs = opts.retryDelayMs ?? 1000;
  const deadline = Date.now() + opts.timeoutSeconds * 1000;

  while (Date.now() <= deadline) {
    // Two-step probe: a private-network route must exist, and an IPv4 address in the 10.0.0.0/8 range must be assigned.
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
  await writeFileMode('/etc/runtime-secrets/manifest.json', JSON.stringify(plan.files.runtimeSecretManifest, null, 2), 0o600);
}

async function dockerLogin(plan: BootPlan, secretKey: string, exec: ExecFn): Promise<void> {
  const [registryHost = ''] = plan.registry.split('/');
  await mustExec(exec, 'docker', ['login', registryHost, '-u', 'nologin', '--password-stdin'], {
    input: secretKey,
    timeoutMs: dockerCallTimeoutSeconds * 1000,
  });
}

/** Compose services this VM runs: explicit names (plans written before container collocation carry none). */
function startServices(plan: BootPlan): [string, ...string[]] {
  return plan.services ?? [plan.profile];
}

async function pullImage(plan: BootPlan, exec: ExecFn): Promise<void> {
  await retry(
    () =>
      // `--quiet` drops the per-layer progress frames; errors still print.
      mustExec(exec, 'docker', ['compose', '--profile', plan.profile, 'pull', '--quiet', ...startServices(plan)], {
        cwd: '/opt/app',
        timeoutMs: pullAttemptTimeoutSeconds * 1000,
      }),
    { attempts: plan.timeouts.pullAttempts, delayMs: plan.timeouts.pullRetrySeconds * 1000 },
  );
}

/** Force-remove the release companion's container, best-effort: a leftover from an interrupted boot would block the fixed name, and a killed CLI leaves it running. */
async function removeReleaseContainer(plan: BootPlan, exec: ExecFn): Promise<void> {
  const name = plan.releaseCommand.containerName;
  if (!name) return;
  await exec('docker', ['rm', '--force', name], { timeoutMs: dockerCallTimeoutSeconds * 1000 }).catch(() => undefined);
}

/**
 * Run the one-shot release companion (migrations) within `timeouts.releaseCommandSeconds`, so a migration stuck on a lock fails the boot and the
 * diagnostics upload names it. On a timeout the CLI is killed and the companion's container removed, so it stops holding database locks.
 */
async function runReleaseCommand(plan: BootPlan, exec: ExecFn, streamingExec: ExecFn): Promise<void> {
  if (!plan.releaseCommand.enabled) return;
  const [command, ...args] = plan.releaseCommand.command;
  await removeReleaseContainer(plan, exec);
  try {
    await mustExec(streamingExec, command, args, { cwd: '/opt/app', timeoutMs: plan.timeouts.releaseCommandSeconds * 1000 });
  } catch (err) {
    await removeReleaseContainer(plan, exec);
    throw err;
  }
}

/**
 * Start the app and any collocated containers, with `--wait` blocking until every started container passes its compose healthcheck.
 * Naming a service explicitly activates its profile, so collocated containers outside the host profile start too.
 */
async function startService(plan: BootPlan, exec: ExecFn): Promise<void> {
  await mustExec(
    exec,
    'docker',
    ['compose', '--profile', plan.profile, 'up', '-d', '--wait', '--wait-timeout', String(startupTimeoutSeconds), ...startServices(plan)],
    // `--wait-timeout` bounds the health wait; the kill is the backstop for a CLI that hangs past it.
    { cwd: '/opt/app', timeoutMs: (startupTimeoutSeconds + dockerCallTimeoutSeconds) * 1000 },
  );
}

/** Best-effort tail of the app container's stdout/stderr, secret-scrubbed at capture so the telemetry body and boot-diag upload only ever see the scrubbed form. */
async function captureServiceLogs(plan: BootPlan, exec: ExecFn): Promise<string> {
  const res = await exec('docker', ['compose', '--profile', plan.profile, 'logs', '--no-color', '--tail', '200', ...startServices(plan)], {
    cwd: '/opt/app',
    timeoutMs: dockerCallTimeoutSeconds * 1000,
  });
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
  const plan = parseBootPlanJson(await readFile(opts.planPath, 'utf-8'), opts.planPath);
  // Learns every secret value as boot handles it; the console, telemetry and the diagnostics upload all redact through it.
  const redactor = createSecretRedactor();
  const logger = createJsonLogger({ service: plan.service, release: plan.releaseSha }, (line) => console.info(redactor.redact(line)));
  const accessKey = await readKeyFile(plan.credentials.scwAccessKeyFile);
  const secretKey = await readKeyFile(plan.credentials.scwSecretKeyFile);
  redactor.add(accessKey, secretKey);
  // Build-only until secret hydration delivers an ingest key; every record lands in the black-box JSONL either way, joined to the deploy trace.
  const telemetry: Telemetry = createTelemetry({
    resource: { 'service.name': 'infra-boot', 'app.service': plan.service, 'vcs.ref.head.revision': plan.releaseSha },
    traceparent: plan.traceparent,
    onError: (message) => logger.log('warn', 'telemetry-export-failed', { message }),
    redact: redactor.redact,
  });
  const bootSpan = telemetry.startSpan(`boot ${plan.service}`, { service: plan.service, sha: plan.releaseSha });
  telemetry.event(bootEvents.started, { service: plan.service, sha: plan.releaseSha });
  // Exports run in the background: flush swallows its errors and bounds each request, so the sink can neither fail nor stall the boot.
  const flushInBackground = () => void telemetry.flush();
  let failedPhase: string | undefined;
  let currentPhase = 'boot';
  let phaseOutputLines = 0;
  // A command's output reaches the console (tee'd to the boot log and the serial console) and telemetry as it prints, redacted like every other channel.
  const streamLine = (line: string, stream: 'stdout' | 'stderr') => {
    const text = redactor.redact(scrubSecretLines(line));
    console.info(`[${currentPhase}] ${text}`);
    phaseOutputLines += 1;
    if (phaseOutputLines <= outputLinesPerPhase) {
      telemetry.event(bootEvents.output, { service: plan.service, step: currentPhase, stream }, { body: text, ctx: bootSpan.ctx });
    } else if (phaseOutputLines === outputLinesPerPhase + 1) {
      telemetry.event(
        bootEvents.outputCapped,
        { service: plan.service, step: currentPhase, cap: outputLinesPerPhase },
        { severity: 'warn', ctx: bootSpan.ctx },
      );
    }
  };
  const streamingExec: ExecFn = (command, args, opts) => exec(command, args, { ...opts, onLine: streamLine });
  const phase = async (step: string, run: () => Promise<unknown>): Promise<void> => {
    logger.log('info', step);
    currentPhase = step;
    phaseOutputLines = 0;
    const startedAt = Date.now();
    const elapsedSeconds = () => Math.round((Date.now() - startedAt) / 1000);
    const heartbeat = setInterval(() => {
      logger.log('info', 'heartbeat', { phase: step, elapsed_s: elapsedSeconds() });
      telemetry.event(bootEvents.stepRunning, { service: plan.service, step, elapsed_s: elapsedSeconds() }, { ctx: bootSpan.ctx });
      flushInBackground();
    }, heartbeatSeconds * 1000);
    try {
      await run();
      telemetry.event(bootEvents.stepCompleted, { service: plan.service, step, duration_s: elapsedSeconds() }, { ctx: bootSpan.ctx });
    } catch (err) {
      failedPhase = step;
      telemetry.event(bootEvents.stepFailed, { service: plan.service, step, error: errorMessage(err) }, { severity: 'error', ctx: bootSpan.ctx });
      throw err;
    } finally {
      clearInterval(heartbeat);
      flushInBackground();
    }
  };
  let bootRc = 0;
  let appLogs: string | undefined;
  let failure: string | undefined;

  try {
    await phase('wait-private-network', () => waitForPrivateNetwork({ exec, timeoutSeconds: plan.timeouts.privateNetworkSeconds }));
    await phase('write-app-files', () => writeAppFiles(plan));
    await phase('docker-login', () => dockerLogin(plan, secretKey, streamingExec));
    // Swap the baked boot key for the real service key via the single-access handoff bundle, cache-first on reboots.
    // A consumed bundle on first boot means interception, so this phase throws and the boot halts.
    let serviceKey = { accessKey, secretKey };
    if (plan.serviceKeyHandoff) {
      await phase('fetch-service-key', async () => {
        serviceKey = await fetchServiceKey({ handoff: plan.serviceKeyHandoff!, bootSecretKey: secretKey, region: plan.region });
        redactor.add(serviceKey.accessKey, serviceKey.secretKey);
      });
    }
    await phase('hydrate-runtime-secrets', async () => {
      const delivered = await hydrateRuntimeSecrets({
        manifest: plan.files.runtimeSecretManifest,
        secretKey: serviceKey.secretKey,
        region: plan.region,
        outputPath: '/opt/app/.env.runtime',
        // REQ-20: the backend signs S3 requests with its own service key.
        extraLines: plan.exportS3Env ? [`S3_ACCESS_KEY_ID=${serviceKey.accessKey}`, `S3_ACCESS_KEY_SECRET=${serviceKey.secretKey}`] : [],
      });
      redactor.add(...delivered);
    });
    // Export only where the plan declares a sink (config/telemetry.config.ts on the engine side); no vendor endpoint is baked into the boot runner.
    const sink = plan.telemetry;
    const sinkKey = sink ? await sinkKeyFromRuntimeEnv('/opt/app/.env.runtime', sink.keyEnvVar) : undefined;
    if (sink && sinkKey) {
      telemetry.configureExport({ endpoint: sink.endpoint, headers: { [sink.keyHeader]: sinkKey } });
      // Ship what was buffered before the key arrived (the boot start and the first phases).
      flushInBackground();
    }
    await phase('pull-image', () => pullImage(plan, streamingExec));
    await phase('release-command', () => runReleaseCommand(plan, exec, streamingExec));
    await phase('start-service', () => startService(plan, streamingExec));
    logger.log('info', 'boot-complete');
    bootSpan.end('ok');
    telemetry.event(bootEvents.completed, { service: plan.service, sha: plan.releaseSha });
  } catch (err) {
    bootRc = 1;
    failure = errorMessage(err);
    logger.log('error', 'boot-failed', { ...(failedPhase ? { phase: failedPhase } : {}), message: errorMessage(err) });
    // The boot runner runs containerized without the host boot log mounted, so the crashed container's own output is captured here for the diagnostics.
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
    // The entrypoint prints this message to the serial console, and a failed command's output can carry a secret.
    throw new Error(redactor.redact(errorMessage(err)));
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
        failedPhase,
        failure,
        logFile: plan.bootDiagnostics.logFile,
        appLogs,
        events: telemetry.eventsJsonl(),
        redact: redactor.redact,
      });
    } catch (err) {
      logger.log('warn', 'boot-diagnostics-upload-failed', { message: errorMessage(err) });
    }
  }
}
