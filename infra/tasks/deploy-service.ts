import { spawnSync } from 'node:child_process'
import { isMain } from '../lib/is-main'
import { servicesByName } from '../lib/services'
import { promote, setPending } from '../lib/control-store'
import type { GenerationMetadata } from '../lib/generation-metadata'
import type { ServiceName } from '../compose/compose'
import { getFlag, sleep } from './args'
import { createLbGetServers, createLbSetServers, sequenceCutover } from './cutover'
import { createFetchProbe, pollForVersion } from './wait-for-version'

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

// ---------------------------------------------------------------------------
// Control object (S3) — the source of truth for rollout state. Lazily resolved;
// null when no S3 credentials are present (the deploy then cannot record state).
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
        console.warn('[deploy] no S3 credentials; cannot read/write rollout state')
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
 *  failure so a partial cutover never leaves the store inconsistent. */
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

/** Current live rollout entry for a service, read from the control object. */
async function currentRollout(stack: string, service: string): Promise<import('../lib/control-store').ServiceRollout | undefined> {
  const ctx = await controlCtx(stack)
  if (!ctx) return undefined
  const { readControlState } = await import('../lib/control-store')
  const { state } = await readControlState(ctx.s3, ctx.bucket, ctx.key)
  return state.rollout[service]
}

function stackOutput<T>(stack: string, name: string): T {
  const raw = pulumi(['stack', 'output', name, '--stack', stack, '--json'])
  return JSON.parse(raw) as T
}

/** Resolve the generation just materialised for `sha`. When a redeploy keeps the
 *  same sha but changes config, two generations share the sha; the pending one is
 *  the id that differs from the current active. A same-config redeploy collapses
 *  to the active id (a single candidate). */
function resolvePendingGen(generations: GenerationMetadata[], service: string, sha: string, activeId?: string): GenerationMetadata {
  const candidates = generations.filter((item) => item.service === service && item.sha === sha)
  const pending = candidates.find((item) => item.genId !== activeId) ?? candidates[0]
  if (!pending) throw new Error(`Could not resolve pending generation metadata for ${service} @ ${sha}`)
  return pending
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
  if (!service || !sha || !stack) throw new Error('Usage: deploy-service.ts --service <svc> --sha <git-sha> --stack <stack> [--health-url URL] [--lb-zone ZONE]')
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`)

  const definition = servicesByName.get(service)
  if (!definition) throw new Error(`Unknown service '${service}'`)

  const current = await currentRollout(stack, service)
  const healthUrl = healthUrlFromFlag(getFlag(argv, '--health-url'))

  // Record the deploy INTENT (pendingSha) and let the Pulumi program — the genId
  // authority — derive the content-addressed id and materialise the VM. We read
  // the resolved id back from `computeGenerationMetadata`.
  await updateStore(stack, service, (cur) => setPending(cur, sha))
  pulumi(['up', '--stack', stack, '--yes', '--non-interactive'])

  const generations = stackOutput<GenerationMetadata[]>(stack, 'computeGenerationMetadata')
  const target = resolvePendingGen(generations, service, sha, current?.active?.id)

  if (definition.replacementStrategy === 'exclusive') {
    // cdc: no LB, no overlap. The Pulumi program materialised only the new
    // generation (the old one is replaced/destroyed in the same `up`); the new
    // worker reports healthy once it acquires the slot the old one releases.
    console.info(`[deploy ${service}] exclusive replacement -> gen ${target.genId} (${sha})`)
    await updateStore(stack, service, (cur) => promote(cur, { id: target.genId, sha }))
    return
  }

  if (!definition.lbRoute) throw new Error(`Service '${service}' is not exclusive and has no LB route; no deploy path is defined.`)
  if (!healthUrl) throw new Error(`Service '${service}' has no health URL.`)

  const backendIds = stackOutput<Record<string, string>>(stack, 'lbBackendIds')
  const backendId = backendIds[service]
  if (!backendId) throw new Error(`Could not resolve LB backend id for ${service}`)

  // Old serving generation (the active one). Empty on a first deploy — the
  // reconciler then drives the LB straight to [new] once it is healthy.
  const oldGen = current?.active ? generations.find((item) => item.service === service && item.genId === current.active!.id) : undefined
  const oldIps = oldGen ? [oldGen.privateIp] : []

  const zone = getFlag(argv, '--lb-zone') ?? `${process.env.SCW_DEFAULT_REGION ?? process.env.REGION ?? 'fr-par'}-1`
  const secretKey = process.env.SCW_SECRET_KEY
  if (!secretKey) throw new Error('SCW_SECRET_KEY is required for LB cutover')

  console.info(`[deploy ${service}] reconciling LB: old=[${oldIps.join(',') || '<none>'}] -> new=[${target.privateIp}] (gen ${target.genId})`)
  const cutover = await sequenceCutover({
    service,
    strategy: 'lb-overlap',
    drainPolicy: definition.drainPolicy,
    oldIps,
    newIps: [target.privateIp],
    drainSeconds: definition.drainSeconds ?? 10,
    healthAfterExpand: true,
    getServers: createLbGetServers({ secretKey, zone, backendId }),
    setServers: createLbSetServers({ secretKey, zone, backendId }),
    healthGate: () => waitForPublicVersion(healthUrl, sha),
  })
  if (!cutover.ok) throw new Error(`Cutover failed for ${service}: ${cutover.aborted}`)

  console.info(`[deploy ${service}] promoting generation ${target.genId}`)
  await updateStore(stack, service, (cur) => promote(cur, { id: target.genId, sha }))
  // Reap the old generation now that the new one serves healthily. No `previous`
  // is retained; rollback is a revert commit + redeploy (recreates every service).
  pulumi(['up', '--stack', stack, '--yes', '--non-interactive'])
}

if (isMain(import.meta.url)) {
  deployService().catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
}
