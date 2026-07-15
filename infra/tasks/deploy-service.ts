import { isMain } from '../lib/utils/is-main'
import { appConfig } from '../../shared'
import { coHostedServices, servicesByName } from '../lib/services'
import {
  type ControlContext,
  controlContextForStack,
  promote,
  readControlState,
  type ServiceRollout,
  setPending,
  updateServiceRollout,
} from '../lib/stack/control-store'
import { errorMessage } from '../lib/utils/errors'
import type { GenerationMetadata } from '../lib/generation-metadata'
import { runPulumi, stackOutput } from '../lib/stack/run-pulumi'
import type { ServiceName } from '../compose/compose'
import { getFlag, sleep } from './args'
import { createLbGetServers, createLbSetServers, sequenceCutover } from './cutover'
import { createFetchProbe, pollForVersion } from './wait-for-version'

// Control object (S3): the source of truth for rollout state. Lazily resolved;
// null when no S3 credentials are present (the deploy then cannot record state).
let controlCtxPromise: Promise<ControlContext | null> | undefined

function controlCtx(stack: string): Promise<ControlContext | null> {
  controlCtxPromise ??= controlContextForStack(stack, (msg) => console.warn(`[deploy] ${msg}`))
  return controlCtxPromise
}

/** Read-modify-write one service's rollout entry in the control object. Throws on
 *  failure so a partial cutover never leaves the store inconsistent. */
async function updateStore(stack: string, service: string, patch: (current: ServiceRollout | undefined) => ServiceRollout): Promise<void> {
  const ctx = await controlCtx(stack)
  if (!ctx) return
  await updateServiceRollout(ctx.s3, ctx.bucket, ctx.controlKey, service, patch)
}

/** Current live rollout entry for a service, read from the control object. */
async function currentRollout(stack: string, service: string): Promise<ServiceRollout | undefined> {
  const ctx = await controlCtx(stack)
  if (!ctx) return undefined
  const { state } = await readControlState(ctx.s3, ctx.bucket, ctx.controlKey)
  return state.rollout[service]
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
  const serviceFlag = getFlag(argv, '--service')
  const sha = getFlag(argv, '--sha')
  const stack = getFlag(argv, '--stack')
  if (!serviceFlag || !sha || !stack) throw new Error('Usage: deploy-service.ts --service <svc> --sha <git-sha> --stack <stack> [--health-url URL] [--lb-zone ZONE]')
  if (sha === 'latest' || sha.endsWith(':latest')) throw new Error(`Refusing to deploy non-pinned image tag '${sha}'`)

  // The registry lookup IS the validation: a hit narrows the raw flag to a real
  // ServiceName instead of asserting the union up front.
  const definition = servicesByName.get(serviceFlag as ServiceName)
  if (!definition) throw new Error(`Unknown service '${serviceFlag}'`)
  const service = definition.slug

  const current = await currentRollout(stack, service)
  const healthUrl = healthUrlFromFlag(getFlag(argv, '--health-url'))

  // Record the deploy INTENT (pendingSha) and let the Pulumi program, the genId
  // authority, derive the content-addressed id and materialise the VM. We read
  // the resolved id back from `computeGenerationMetadata`.
  await updateStore(stack, service, (cur) => setPending(cur, sha))
  runPulumi(['up', '--stack', stack, '--yes', '--non-interactive'])

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

  // Serving generation before this deploy (the active one). Empty on a first deploy:
  // reconciler then drives the LB straight to [new] once it is healthy.
  const activeRef = current?.active
  const oldGen = activeRef ? generations.find((item) => item.service === service && item.genId === activeRef.id) : undefined
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

  // Under singleVM the co-hosted lb-routed workers (e.g. yjs) ride this host
  // VM in-process, but their LB backends are separate Scaleway objects nothing
  // else reconciles (Pulumi sets serverIps at create, then ignoreChanges — the
  // cutover task owns the live list). Drive each one to the promoted
  // generation's IP with the same idempotent corrective call, or the worker's
  // public route keeps pointing at a reaped generation forever.
  if (definition.primaryRollout && appConfig.singleVM) {
    for (const worker of coHostedServices(appConfig.services, appConfig.singleVM)) {
      if (!worker.lbRoute) continue
      const workerBackendId = backendIds[worker.slug]
      if (!workerBackendId) {
        console.warn(`[deploy ${service}] co-hosted '${worker.slug}' declares lbRoute but has no LB backend id — skipping repoint`)
        continue
      }
      console.info(`[deploy ${service}] repointing co-hosted ${worker.slug} LB backend -> [${target.privateIp}]`)
      await createLbSetServers({ secretKey, zone, backendId: workerBackendId })([target.privateIp])
    }
  }

  console.info(`[deploy ${service}] promoting generation ${target.genId}`)
  await updateStore(stack, service, (cur) => promote(cur, { id: target.genId, sha }))
  // Reap the old generation now that the new one serves healthily. No `previous`
  // is retained; rollback is a revert commit + redeploy (recreates every service).
  runPulumi(['up', '--stack', stack, '--yes', '--non-interactive'])
}

if (isMain(import.meta.url)) {
  deployService().catch((err) => {
    console.error(errorMessage(err))
    process.exit(1)
  })
}
