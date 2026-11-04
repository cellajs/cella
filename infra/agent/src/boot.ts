import { readFile } from 'node:fs/promises';
import { bootEvents } from '../../lib/telemetry/deploy-telemetry';
import { createTelemetry, type Telemetry } from '../../lib/telemetry/emitter';
import { errorMessage } from '../../lib/utils/errors';
import { loadArchives } from './archives';
import { scrubSecretLines, uploadBootDiagnostics } from './diagnostics';
import { type ExecFn, execCommand, mustExec } from './exec';
import { createJsonLogger } from './logger';
import { type BootPlan, parseBootPlanJson } from './plan';
import { envFileValues, fetchRuntimeEnv } from './runtime-secrets';
import { createSecretRedactor } from './secret-redactor';

/** The machine's env file, kept at 0600 for every boot after the first, which fetched it. */
const runtimeEnvPath = '/opt/app/.env.runtime';

/** Ceiling on the quick docker calls (log capture, image checks). */
const dockerCallTimeoutSeconds = 60;

/** Seconds between heartbeats of a running phase: an event and a flush each, so a stuck phase shows up live in the telemetry sink. */
const heartbeatSeconds = 30;

/** Output lines per phase exported as telemetry records; the console and the boot log keep every line. */
const outputLinesPerPhase = 200;

export interface BootOptions {
  planPath: string;
  exec?: ExecFn;
  /** Where archives are fetched to before `docker load`, each deleted after. */
  archiveDir?: string;
}

export interface WaitForPrivateNetworkOptions {
  exec: ExecFn;
  timeoutSeconds: number;
  retryDelayMs?: number;
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

/** `--profile` for every service started: each runs in its own profile, the release companion in its service's. */
function profileArgs(plan: BootPlan): string[] {
  return plan.services.flatMap((service) => ['--profile', service]);
}

/**
 * Start the app and any collocated containers with one `compose up`: the release companion runs first as the app's completion dependency,
 * and `--wait` blocks until every started container passes its healthcheck, all within `timeouts.composeWaitSeconds`. A companion that
 * fails or a container that stays unhealthy fails the boot, and the diagnostics upload names it.
 */
async function startServices(plan: BootPlan, exec: ExecFn): Promise<void> {
  const wait = plan.timeouts.composeWaitSeconds;
  await mustExec(exec, 'docker', ['compose', ...profileArgs(plan), 'up', '-d', '--wait', '--wait-timeout', String(wait), ...plan.services], {
    cwd: '/opt/app',
    // `--wait-timeout` bounds the wait; the kill is the backstop for a CLI that hangs past it.
    timeoutMs: (wait + dockerCallTimeoutSeconds) * 1000,
  });
}

/** Best-effort tail of the app container's stdout/stderr, secret-scrubbed at capture so the telemetry body and boot-diag upload only ever see the scrubbed form. */
async function captureServiceLogs(plan: BootPlan, exec: ExecFn): Promise<string> {
  const res = await exec('docker', ['compose', ...profileArgs(plan), 'logs', '--no-color', '--tail', '200'], {
    cwd: '/opt/app',
    timeoutMs: dockerCallTimeoutSeconds * 1000,
  });
  return scrubSecretLines((res.stdout || res.stderr || '').trim());
}

/** The plan-declared ingest-key env var from the machine's env file, if delivered. */
function sinkKeyFromRuntimeEnv(content: string, keyEnvVar: string): string | undefined {
  const line = content.split('\n').find((entry) => entry.startsWith(`${keyEnvVar}=`));
  const value = line?.slice(line.indexOf('=') + 1).trim();
  return value || undefined;
}

export async function boot(opts: BootOptions): Promise<void> {
  const exec = opts.exec ?? execCommand;
  const plan = parseBootPlanJson(await readFile(opts.planPath, 'utf-8'), opts.planPath);
  // Learns every link and secret value as boot handles it; the console, telemetry and the diagnostics upload all redact through it.
  const redactor = createSecretRedactor();
  const logger = createJsonLogger({ service: plan.service, release: plan.releaseSha }, (line) => console.info(redactor.redact(line)));
  redactor.add(plan.links.env, plan.links.bootAccount, ...plan.links.archives.map((archive) => archive.url));
  // Build-only until the env file delivers an ingest key; every record lands in the black-box JSONL either way, joined to the deploy trace.
  const telemetry: Telemetry = createTelemetry({
    resource: { 'service.name': 'infra-agent', 'app.service': plan.service, 'vcs.ref.head.revision': plan.releaseSha },
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
    let runtimeEnv = '';
    await phase('fetch-env', async () => {
      const env = await fetchRuntimeEnv({
        url: plan.links.env,
        outputPath: runtimeEnvPath,
        attempts: plan.timeouts.fetchAttempts,
        retryDelayMs: plan.timeouts.fetchRetrySeconds * 1000,
      });
      redactor.add(...envFileValues(env.content));
      runtimeEnv = env.content;
      logger.log('info', env.fetched ? 'env-fetched' : 'env-kept');
    });
    // Export only where the plan declares a sink (config/telemetry.config.ts on the engine side); no vendor endpoint is baked into the agent.
    const sink = plan.telemetry;
    const sinkKey = sink ? sinkKeyFromRuntimeEnv(runtimeEnv, sink.keyEnvVar) : undefined;
    if (sink && sinkKey) {
      telemetry.configureExport({ endpoint: sink.endpoint, headers: { [sink.keyHeader]: sinkKey } });
      // Ship what was buffered before the key arrived (the boot start and the first phases).
      flushInBackground();
    }
    await phase('load-images', () =>
      loadArchives({
        archives: plan.links.archives,
        dir: opts.archiveDir ?? '/opt/app/images',
        exec: streamingExec,
        attempts: plan.timeouts.fetchAttempts,
        retryDelayMs: plan.timeouts.fetchRetrySeconds * 1000,
        log: (message) => logger.log('info', 'image', { message }),
      }),
    );
    await phase('start-service', () => startServices(plan, streamingExec));
    logger.log('info', 'boot-complete');
    bootSpan.end('ok');
    telemetry.event(bootEvents.completed, { service: plan.service, sha: plan.releaseSha });
  } catch (err) {
    bootRc = 1;
    failure = errorMessage(err);
    logger.log('error', 'boot-failed', { ...(failedPhase ? { phase: failedPhase } : {}), message: errorMessage(err) });
    // The app containers log to Docker, outside the boot log, so a crashed container's own output is captured here for the diagnostics.
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
        url: plan.links.bootAccount,
        service: plan.service,
        releaseSha: plan.releaseSha,
        bootRc,
        failedPhase,
        failure,
        logFile: plan.bootDiagnostics.logFile,
        appLogs,
        redact: redactor.redact,
      });
    } catch (err) {
      logger.log('warn', 'boot-diagnostics-upload-failed', { message: errorMessage(err) });
    }
  }
}
