import { readFile } from 'node:fs/promises';
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

/** Seconds between the heartbeat lines of a running phase, which show a stuck phase on the serial console while it hangs. */
const heartbeatSeconds = 30;

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

/** Best-effort tail of the app container's stdout/stderr, secret-scrubbed at capture so the boot account only ever holds the scrubbed form. */
async function captureServiceLogs(plan: BootPlan, exec: ExecFn): Promise<string> {
  const res = await exec('docker', ['compose', ...profileArgs(plan), 'logs', '--no-color', '--tail', '200'], {
    cwd: '/opt/app',
    timeoutMs: dockerCallTimeoutSeconds * 1000,
  });
  return scrubSecretLines((res.stdout || res.stderr || '').trim());
}

export async function boot(opts: BootOptions): Promise<void> {
  const exec = opts.exec ?? execCommand;
  const plan = parseBootPlanJson(await readFile(opts.planPath, 'utf-8'), opts.planPath);
  // Learns every link and secret value as boot handles it; the console and the boot account both redact through it.
  const redactor = createSecretRedactor();
  const logger = createJsonLogger({ service: plan.service, release: plan.releaseSha }, (line) => console.info(redactor.redact(line)));
  redactor.add(plan.links.env, plan.links.bootAccount, ...plan.links.archives.map((archive) => archive.url));
  let failedPhase: string | undefined;
  let currentPhase = 'boot';
  // A command's output reaches the console (tee'd to the boot log and the serial console) as it prints, redacted like every other channel.
  const streamLine = (line: string) => console.info(`[${currentPhase}] ${redactor.redact(scrubSecretLines(line))}`);
  const streamingExec: ExecFn = (command, args, opts) => exec(command, args, { ...opts, onLine: streamLine });
  const phase = async (step: string, run: () => Promise<unknown>): Promise<void> => {
    logger.log('info', step);
    currentPhase = step;
    const startedAt = Date.now();
    const elapsedSeconds = () => Math.round((Date.now() - startedAt) / 1000);
    const heartbeat = setInterval(() => logger.log('info', 'heartbeat', { phase: step, elapsed_s: elapsedSeconds() }), heartbeatSeconds * 1000);
    try {
      await run();
    } catch (err) {
      failedPhase = step;
      throw err;
    } finally {
      clearInterval(heartbeat);
    }
  };
  let bootRc = 0;
  let appLogs: string | undefined;
  let failure: string | undefined;

  try {
    await phase('wait-private-network', () => waitForPrivateNetwork({ exec, timeoutSeconds: plan.timeouts.privateNetworkSeconds }));
    await phase('fetch-env', async () => {
      const env = await fetchRuntimeEnv({
        url: plan.links.env,
        outputPath: runtimeEnvPath,
        attempts: plan.timeouts.fetchAttempts,
        retryDelayMs: plan.timeouts.fetchRetrySeconds * 1000,
      });
      redactor.add(...envFileValues(env.content));
      logger.log('info', env.fetched ? 'env-fetched' : 'env-kept');
    });
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
  } catch (err) {
    bootRc = 1;
    failure = errorMessage(err);
    logger.log('error', 'boot-failed', { ...(failedPhase ? { phase: failedPhase } : {}), message: errorMessage(err) });
    // The app containers log to Docker, outside the boot log, so a crashed container's own output is captured here for the diagnostics.
    appLogs = await captureServiceLogs(plan, exec).catch(() => undefined);
    // The entrypoint prints this message to the serial console, and a failed command's output can carry a secret.
    throw new Error(redactor.redact(errorMessage(err)));
  } finally {
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
