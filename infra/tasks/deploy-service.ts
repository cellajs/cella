import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/is-main'
import { servicesByName } from '../lib/services'
import type { ServiceName } from '../compose/compose'
import { getFlag, getNumFlag, sleep } from './args'
import { createLbGetServers, createLbSetServers, sequenceCutover } from './cutover'
import { createFetchProbe, pollForVersion } from './wait-for-version'

interface GenerationMetadata {
  service: ServiceName
  gen: number
  name: string
  serverId: string
  privateIp: string
  privateNicId: string
}

function run(command: string, args: string[], opts: { cwd?: string; allowFailure?: boolean } = {}): string {
  const res = spawnSync(command, args, {
    cwd: opts.cwd,
    env: process.env,
    encoding: 'utf-8',
    stdio: ['inherit', 'pipe', 'pipe'],
  })
  if (res.stdout) process.stdout.write(res.stdout)
  if (res.stderr) process.stderr.write(res.stderr)
  if (res.status !== 0 && !opts.allowFailure) throw new Error(`${command} ${args.join(' ')} failed with exit ${res.status}`)
  return res.stdout.trim()
}

function pulumi(args: string[], opts: { allowFailure?: boolean } = {}): string {
  return run('pulumi', args, { cwd: new URL('..', import.meta.url).pathname, ...opts })
}

function configKey(service: string, key: 'gen' | 'sha' | 'pendingGen' | 'pendingSha'): string {
  return `infra:${key}_${service}`
}

function getConfigNumber(stack: string, key: string, fallback: number): number {
  const raw = pulumi(['config', 'get', key, '--stack', stack], { allowFailure: true }).trim()
  return raw ? Number(raw) : fallback
}

function getConfigString(stack: string, key: string): string | undefined {
  const raw = pulumi(['config', 'get', key, '--stack', stack], { allowFailure: true }).trim()
  return raw || undefined
}

function setConfig(stack: string, key: string, value: string | number): void {
  pulumi(['config', 'set', key, String(value), '--stack', stack])
}

function rmConfig(stack: string, key: string): void {
  pulumi(['config', 'rm', key, '--stack', stack], { allowFailure: true })
}

// ---------------------------------------------------------------------------
// Control object (S3) — the source of truth compute.ts reads. Written alongside
// the legacy Pulumi config during migration. Lazily resolved; null when no S3
// credentials are present (credless runs fall back to Pulumi config only).
// ---------------------------------------------------------------------------
interface ControlCtx {
  s3: import('../lib/control-store').S3Like
  bucket: string
  key: string
}
let controlCtxPromise: Promise<ControlCtx | null> | undefined

function controlCtx(stack: string): Promise<ControlCtx | null> {
  if (!controlCtxPromise) {
    controlCtxPromise = (async () => {
      const accessKey = process.env.SCW_ACCESS_KEY ?? process.env.AWS_ACCESS_KEY_ID
      const secretKey = process.env.SCW_SECRET_KEY ?? process.env.AWS_SECRET_ACCESS_KEY
      if (!accessKey || !secretKey) {
        console.warn('[deploy] no S3 credentials; control object not updated (Pulumi config only)')
        return null
      }
      process.env.APP_MODE ??= stack.split('/').pop()
      const { appConfig } = await import('shared')
      const { controlClientFromEnv, controlKey, stateBucket } = await import('../lib/control-store')
      const s3 = await controlClientFromEnv(appConfig.s3.region)
      return { s3, bucket: stateBucket(appConfig.slug), key: controlKey(stack) }
    })()
  }
  return controlCtxPromise
}

/** Read-modify-write one service's rollout entry in the control object. Throws on
 *  failure (when a context exists) so we never leave a stale store overriding the
 *  fresh config compute.ts reads. */
async function updateStore(
  stack: string,
  service: string,
  patch: (current: import('../lib/control-store').ServiceRollout | undefined) => import('../lib/control-store').ServiceRollout,
): Promise<void> {
  const ctx = await controlCtx(stack)
  if (!ctx) return
  const { updateServiceRollout } = await import('../lib/control-store')
  await updateServiceRollout(ctx.s3, ctx.bucket, ctx.key, service, patch)
}

function stackOutput<T>(stack: string, name: string): T {
  const raw = pulumi(['stack', 'output', name, '--stack', stack, '--json'])
  return JSON.parse(raw) as T
}

function healthUrlFromFlag(explicit?: string): string | undefined {
  if (!explicit) return undefined
  return explicit.endsWith('/health') ? explicit : `${explicit.replace(/\/$/, '')}/health`
}

// Cold-boot budget: a fresh VM generation pulls its image, runs migrate, and
// starts the app before it serves the new SHA (~110s observed). The gate must
// outlast that, so keep a generous attempt count (120 * 3s = 360s).
const deployHealthAttempts = 120
const deployHealthIntervalMs = 3000
const deployHealthTimeoutMs = 8000

async function waitForPublicVersion(url: string, sha: string): Promise<boolean> {
  const out = await pollForVersion({
    url,
    expectedSha: sha,
    probe: createFetchProbe(deployHealthTimeoutMs),
    attempts: deployHealthAttempts,
    intervalMs: deployHealthIntervalMs,
    sleep,
  })
  return out.ok
}

export async function deployService(argv = process.argv.slice(2)): Promise<void> {
  const service = getFlag(argv, '--service') as ServiceName | undefined
  const sha = getFlag(argv, '--sha')
  const stack = getFlag(argv, '--stack')
  if (!service || !sha || !stack) throw new Error('Usage: deploy-service.ts --service <svc> --sha <git-sha> --stack <stack> [--gen N] [--health-url URL] [--lb-zone ZONE]')
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`)

  const definition = servicesByName.get(service)
  if (!definition) throw new Error(`Unknown service '${service}'`)

  const currentGen = getConfigNumber(stack, configKey(service, 'gen'), 1)
  const currentSha = getConfigString(stack, configKey(service, 'sha'))
  const nextGen = getNumFlag(argv, '--gen', currentGen + 1)
  const healthUrl = healthUrlFromFlag(getFlag(argv, '--health-url'))

  if (definition.replacementStrategy === 'exclusive') {
    console.info(`[deploy ${service}] exclusive replacement: gen ${currentGen} -> ${nextGen}`)
    setConfig(stack, configKey(service, 'gen'), nextGen)
    setConfig(stack, configKey(service, 'sha'), sha)
    rmConfig(stack, configKey(service, 'pendingGen'))
    rmConfig(stack, configKey(service, 'pendingSha'))
    await updateStore(stack, service, () => ({ gen: nextGen, sha }))
    pulumi(['up', '--stack', stack, '--yes', '--non-interactive'])
    return
  }

  if (!definition.lbRoute) throw new Error(`Service '${service}' is not exclusive and has no LB route; no deploy path is defined.`)
  if (!healthUrl) throw new Error(`Service '${service}' has no health URL.`)

  console.info(`[deploy ${service}] creating pending generation ${nextGen} alongside ${currentGen}`)
  setConfig(stack, configKey(service, 'pendingGen'), nextGen)
  setConfig(stack, configKey(service, 'pendingSha'), sha)
  await updateStore(stack, service, (cur) => ({
    gen: cur?.gen ?? currentGen,
    sha: cur?.sha ?? currentSha ?? 'latest',
    pendingGen: nextGen,
    pendingSha: sha,
  }))
  pulumi(['up', '--stack', stack, '--yes', '--non-interactive'])

  const generations = stackOutput<GenerationMetadata[]>(stack, 'computeGenerationMetadata')
  const backendIds = stackOutput<Record<string, string>>(stack, 'lbBackendIds')
  const oldGen = generations.find((item) => item.service === service && item.gen === currentGen)
  const newGen = generations.find((item) => item.service === service && item.gen === nextGen)
  if (!oldGen || !newGen) throw new Error(`Could not resolve old/new generation metadata for ${service}: ${currentGen} -> ${nextGen}`)
  const backendId = backendIds[service]
  if (!backendId) throw new Error(`Could not resolve LB backend id for ${service}`)

  const zone = getFlag(argv, '--lb-zone') ?? `${process.env.SCW_DEFAULT_REGION ?? process.env.REGION ?? 'fr-par'}-1`
  const secretKey = process.env.SCW_SECRET_KEY
  if (!secretKey) throw new Error('SCW_SECRET_KEY is required for LB cutover')

  const cutover = await sequenceCutover({
    service,
    strategy: 'lb-overlap',
    drainPolicy: definition.drainPolicy,
    oldIps: [oldGen.privateIp],
    newIps: [newGen.privateIp],
    drainSeconds: definition.drainSeconds ?? 10,
    healthAfterExpand: true,
    getServers: createLbGetServers({ secretKey, zone, backendId }),
    setServers: createLbSetServers({ secretKey, zone, backendId }),
    healthGate: () => waitForPublicVersion(healthUrl, sha),
  })
  if (!cutover.ok) throw new Error(`Cutover failed for ${service}: ${cutover.aborted}`)

  console.info(`[deploy ${service}] promoting generation ${nextGen}`)
  setConfig(stack, configKey(service, 'gen'), nextGen)
  setConfig(stack, configKey(service, 'sha'), sha)
  rmConfig(stack, configKey(service, 'pendingGen'))
  rmConfig(stack, configKey(service, 'pendingSha'))
  await updateStore(stack, service, () => ({ gen: nextGen, sha }))
  pulumi(['up', '--stack', stack, '--yes', '--non-interactive'])
}

if (isMain(import.meta.url)) {
  deployService().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
