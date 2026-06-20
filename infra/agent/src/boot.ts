import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { createJsonLogger } from './logger'
import { execCommand, mustExec, type ExecFn } from './exec'
import { uploadBootDiagnostics } from './diagnostics'
import { hydrateRuntimeSecrets } from './runtime-secrets'
import { parseBootPlanJson, type BootPlan } from './plan'

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
    const route = await opts.exec('ip', ['route', 'get', '10.0.0.1'])
    const addresses = route.code === 0 ? await opts.exec('ip', ['-4', 'addr', 'show']) : { code: 1, stdout: '', stderr: '' }
    if (route.code === 0 && addresses.code === 0 && addresses.stdout.includes('10.0.')) return
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
  const registryHost = plan.registry.split('/')[0]!
  await mustExec(exec, 'docker', ['login', registryHost, '-u', 'nologin', '--password-stdin'], { input: secretKey })
}

async function pullImage(plan: BootPlan, exec: ExecFn): Promise<void> {
  let lastError: unknown
  for (let attempt = 1; attempt <= plan.timeouts.pullAttempts; attempt++) {
    try {
      await mustExec(exec, 'docker', ['compose', '--profile', plan.profile, 'pull', plan.profile], { cwd: '/opt/app' })
      return
    } catch (err) {
      lastError = err
      if (attempt < plan.timeouts.pullAttempts) await sleep(plan.timeouts.pullRetrySeconds * 1000)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('image pull failed')
}

async function runReleaseCommand(plan: BootPlan, exec: ExecFn): Promise<void> {
  if (!plan.releaseCommand.enabled) return
  const [command, ...args] = plan.releaseCommand.command
  await mustExec(exec, command!, args, { cwd: '/opt/app' })
}

async function startService(plan: BootPlan, exec: ExecFn): Promise<void> {
  await mustExec(exec, 'docker', ['compose', '--profile', plan.profile, 'up', '-d', plan.profile], { cwd: '/opt/app' })
}

export async function boot(opts: BootOptions): Promise<void> {
  const exec = opts.exec ?? execCommand
  const plan = parseBootPlanJson(await readFile(opts.planPath, 'utf-8'))
  const logger = createJsonLogger({ service: plan.service, release: plan.releaseSha })
  const accessKey = await readCredential(plan.credentials.scwAccessKeyFile)
  const secretKey = await readCredential(plan.credentials.scwSecretKeyFile)
  let bootRc = 0

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
    logger.log('error', 'boot-failed', { message: err instanceof Error ? err.message : String(err) })
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
      })
    } catch (err) {
      logger.log('warn', 'boot-diagnostics-upload-failed', { message: err instanceof Error ? err.message : String(err) })
    }
  }
}
