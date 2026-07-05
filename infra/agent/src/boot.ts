import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { errorMessage } from '../../lib/utils/errors'
import { retry } from '../../lib/utils/retry'
import { createJsonLogger } from './logger'
import { execCommand, mustExec, type ExecFn } from './exec'
import { uploadBootDiagnostics } from './diagnostics'
import { hydrateRuntimeSecrets } from './runtime-secrets'
import { parseBootPlanJson, type BootPlan } from './plan'

/** Seconds to wait for the started container to become healthy before failing the boot. */
const startupTimeoutSeconds = 120

export interface BootOptions {
  planPath: string
  exec?: ExecFn
}

export interface WaitForPrivateNetworkOptions {
  exec: ExecFn
  timeoutSeconds: number
  retryDelayMs?: number
}

async function writeFileMode(path: string, content: string, mode: number): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, content, 'utf-8')
  await chmod(path, mode)
}

async function readCredential(path: string): Promise<string> {
  return (await readFile(path, 'utf-8')).trim()
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms))
}

export async function waitForPrivateNetwork(opts: WaitForPrivateNetworkOptions): Promise<void> {
  const retryDelayMs = opts.retryDelayMs ?? 1000
  const deadline = Date.now() + opts.timeoutSeconds * 1000

  while (Date.now() <= deadline) {
    // Two-step probe: a private-network route must exist, and an IPv4 address
    // in the 10.0.0.0/8 range must be assigned.
    const route = await opts.exec('ip', ['route', 'get', '10.0.0.1'])
    if (route.code === 0) {
      const addresses = await opts.exec('ip', ['-4', 'addr', 'show'])
      if (addresses.code === 0 && addresses.stdout.includes('10.0.')) return
    }
    await sleep(retryDelayMs)
  }

  throw new Error(`private network did not become ready within ${opts.timeoutSeconds}s`)
}

async function writeAppFiles(plan: BootPlan): Promise<void> {
  await writeFileMode(plan.docker.composeFile, plan.files.compose, 0o600)
  await writeFileMode('/opt/app/.env', plan.files.env, 0o600)
  await writeFileMode('/etc/runtime-secrets/manifest.json', JSON.stringify(plan.files.runtimeSecretManifest, null, 2), 0o600)
}

async function dockerLogin(plan: BootPlan, secretKey: string, exec: ExecFn): Promise<void> {
  const [registryHost = ''] = plan.registry.split('/')
  await mustExec(exec, 'docker', ['login', registryHost, '-u', 'nologin', '--password-stdin'], { input: secretKey })
}

async function pullImage(plan: BootPlan, exec: ExecFn): Promise<void> {
  await retry(() => mustExec(exec, 'docker', ['compose', '--profile', plan.profile, 'pull', plan.profile], { cwd: '/opt/app' }), {
    attempts: plan.timeouts.pullAttempts,
    delayMs: plan.timeouts.pullRetrySeconds * 1000,
  })
}

async function runReleaseCommand(plan: BootPlan, exec: ExecFn): Promise<void> {
  if (!plan.releaseCommand.enabled) return
  const [command, ...args] = plan.releaseCommand.command
  await mustExec(exec, command, args, { cwd: '/opt/app' })
}

/**
 * Start the app and wait for its compose healthcheck. `--wait` blocks until the
 * container is healthy.
 */
async function startService(plan: BootPlan, exec: ExecFn): Promise<void> {
  await mustExec(exec, 'docker', ['compose', '--profile', plan.profile, 'up', '-d', '--wait', '--wait-timeout', String(startupTimeoutSeconds), plan.profile], { cwd: '/opt/app' })
}

/** Best-effort tail of the app container's own stdout/stderr for diagnostics. */
async function captureServiceLogs(plan: BootPlan, exec: ExecFn): Promise<string> {
  const res = await exec('docker', ['compose', '--profile', plan.profile, 'logs', '--no-color', '--tail', '200', plan.profile], { cwd: '/opt/app' })
  return (res.stdout || res.stderr || '').trim()
}

export async function boot(opts: BootOptions): Promise<void> {
  const exec = opts.exec ?? execCommand
  const plan = parseBootPlanJson(await readFile(opts.planPath, 'utf-8'))
  const logger = createJsonLogger({ service: plan.service, release: plan.releaseSha })
  const accessKey = await readCredential(plan.credentials.scwAccessKeyFile)
  const secretKey = await readCredential(plan.credentials.scwSecretKeyFile)
  let bootRc = 0
  let appLogs: string | undefined

  try {
    logger.log('info', 'wait-private-network')
    await waitForPrivateNetwork({ exec, timeoutSeconds: plan.timeouts.privateNetworkSeconds })
    logger.log('info', 'write-app-files')
    await writeAppFiles(plan)
    logger.log('info', 'docker-login')
    await dockerLogin(plan, secretKey, exec)
    logger.log('info', 'hydrate-runtime-secrets')
    await hydrateRuntimeSecrets({ manifest: plan.files.runtimeSecretManifest, secretKey, region: plan.region, outputPath: '/opt/app/.env.runtime' })
    logger.log('info', 'pull-image')
    await pullImage(plan, exec)
    logger.log('info', 'release-command')
    await runReleaseCommand(plan, exec)
    logger.log('info', 'start-service')
    await startService(plan, exec)
    logger.log('info', 'boot-complete')
  } catch (err) {
    bootRc = 1
    logger.log('error', 'boot-failed', { message: errorMessage(err) })
    // The agent runs containerized without the host boot log mounted, so capture
    // the crashed container's own output here to ship it with the diagnostics.
    appLogs = await captureServiceLogs(plan, exec).catch(() => undefined)
    throw err
  } finally {
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
      })
    } catch (err) {
      logger.log('warn', 'boot-diagnostics-upload-failed', { message: errorMessage(err) })
    }
  }
}
