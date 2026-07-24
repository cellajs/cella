import type { ServiceName } from '../compose/compose'
import type { DrainPolicy, ReplacementStrategy } from '../compose/types'
import type { GenerationMetadata } from '../lib/generation-metadata'
import type { ServiceRollout } from '../lib/stack/control-store'
import { sequenceCutover } from './cutover'

/** One service's rollout inputs, resolved from the service registry. */
export interface RolloutServicePlan {
  service: ServiceName
  strategy: ReplacementStrategy
  drainPolicy?: DrainPolicy
  drainSeconds: number
  /** Public health URL; required for lb-overlap services. */
  healthUrl?: string
  /** Co-hosted worker slugs (singleVM) whose LB backends follow this VM. */
  repointBackendKeys?: string[]
}

/**
 * Every effect the waved rollout performs, injected so wave sequencing is fully
 * unit-testable. The real implementation (rollout-runtime.ts) wires Pulumi, the
 * S3 control object, the Scaleway LB API, and public health polling.
 */
export interface RolloutRuntime {
  /**
   * Provision/reap the generations of the given services. The monolith
   * topology runs ONE full-stack update regardless of the list; the micro
   * topology updates each service's own generation stack, in parallel.
   */
  update(services: string[]): Promise<void>
  /**
   * Reap displaced generations after every promotion, on BOTH planes: the
   * services' own stacks (micro) or the foundation stack (monolith), plus the
   * other plane's leftovers so a topology switch cannot strand serving VMs
   * (adoption leaves foundation generations, revert leaves generation stacks).
   */
  reap(services: string[]): Promise<void>
  /** The `computeGenerationMetadata` stack output. */
  readGenerations(): Promise<GenerationMetadata[]>
  /** The `lbBackendIds` stack output (service slug to LB backend id). */
  readLbBackendIds(): Promise<Record<string, string>>
  /** Current rollout entry for a service from the control object. */
  currentRollout(service: string): Promise<ServiceRollout | undefined>
  /** Record deploy intent (pendingSha) for a service. */
  setPending(service: string, sha: string): Promise<void>
  /** Promote a resolved generation to active for a service. */
  promote(service: string, gen: { id: string; sha: string }): Promise<void>
  lbGetServers(backendId: string): Promise<string[]>
  lbSetServers(backendId: string, ips: string[]): Promise<void>
  /** Resolves true once `url` serves the expected release SHA. */
  healthGate(url: string, sha: string): Promise<boolean>
  sleep(ms: number): Promise<void>
  info(msg: string): void
}

/** Resolve the generation just provisioned for `sha`. When a redeploy keeps the
 *  same sha but changes config, two generations share the sha; the pending one is
 *  the id that differs from the current active. A same-config redeploy collapses
 *  to the active id (a single candidate). */
export function resolvePendingGen(generations: GenerationMetadata[], service: string, sha: string, activeId?: string): GenerationMetadata {
  const candidates = generations.filter((item) => item.service === service && item.sha === sha)
  const pending = candidates.find((item) => item.genId !== activeId) ?? candidates[0]
  if (!pending) throw new Error(`Could not resolve pending generation metadata for ${service} @ ${sha}`)
  return pending
}

/**
 * Health-gate and cut over one provisioned service generation, then promote it.
 * Assumes the stack update that provisions the generation already ran; reads the
 * pre-promotion active generation to build the LB overlap.
 */
export async function activateService(
  plan: RolloutServicePlan,
  sha: string,
  generations: GenerationMetadata[],
  backendIds: Record<string, string>,
  rt: RolloutRuntime,
): Promise<void> {
  const service = plan.service
  const current = await rt.currentRollout(service)
  const target = resolvePendingGen(generations, service, sha, current?.active?.id)

  if (plan.strategy === 'exclusive') {
    // cdc: no LB, no overlap. The stack update provisioned only the new
    // generation (the old one is replaced/destroyed in the same update); the new
    // worker reports healthy once it acquires the slot the old one releases.
    rt.info(`[deploy ${service}] exclusive replacement -> gen ${target.genId} (${sha})`)
    await rt.promote(service, { id: target.genId, sha })
    return
  }

  if (!plan.healthUrl) throw new Error(`Service '${service}' has no health URL.`)
  const backendId = backendIds[service]
  if (!backendId) throw new Error(`Could not resolve LB backend id for ${service}`)

  // Serving generation before this deploy (the active one). Empty on a first deploy:
  // reconciler then drives the LB straight to [new] once it is healthy.
  const activeRef = current?.active
  const oldGen = activeRef ? generations.find((item) => item.service === service && item.genId === activeRef.id) : undefined
  const oldIps = oldGen ? [oldGen.privateIp] : []

  rt.info(`[deploy ${service}] reconciling LB: old=[${oldIps.join(',') || '<none>'}] -> new=[${target.privateIp}] (gen ${target.genId})`)
  const healthUrl = plan.healthUrl
  const cutover = await sequenceCutover({
    service,
    strategy: 'lb-overlap',
    drainPolicy: plan.drainPolicy,
    oldIps,
    newIps: [target.privateIp],
    drainSeconds: plan.drainSeconds,
    healthAfterExpand: true,
    getServers: () => rt.lbGetServers(backendId),
    setServers: (ips) => rt.lbSetServers(backendId, ips),
    healthGate: () => rt.healthGate(healthUrl, sha),
    sleep: rt.sleep,
    log: rt.info,
  })
  if (!cutover.ok) throw new Error(`Cutover failed for ${service}: ${cutover.aborted}`)

  // Repoint the LB pools that follow this service's VM (co-hosted workers'
  // pools, the service's own internal pool). Pulumi ignores their live server
  // lists, so cutover must remove reaped-generation IPs.
  for (const key of plan.repointBackendKeys ?? []) {
    const followerBackendId = backendIds[key]
    if (!followerBackendId) {
      rt.info(`[deploy ${service}] follower pool '${key}' has no LB backend id, skipping repoint`)
      continue
    }
    rt.info(`[deploy ${service}] repointing follower pool '${key}' -> [${target.privateIp}]`)
    await rt.lbSetServers(followerBackendId, [target.privateIp])
  }

  rt.info(`[deploy ${service}] promoting generation ${target.genId}`)
  await rt.promote(service, { id: target.genId, sha })
}

export interface WavedRolloutPlan {
  sha: string
  /** Rolled alone in wave 1: consumers bake this service's promoted address. */
  primary?: RolloutServicePlan
  /** Rolled together in wave 2: one provisioning update, concurrent cutovers. */
  rest: RolloutServicePlan[]
}

/**
 * Two-wave rollout. Wave 1 deploys the primary service alone (consumers bake its
 * promoted generation's address at plan time, so it must promote first). Wave 2
 * records pending intent for every remaining service, provisions all their
 * generations in ONE stack update (which also reaps the primary's displaced
 * generation), then health-gates and cuts each service over concurrently.
 * A final reap removes every remaining displaced generation on both planes.
 * Any cutover failure skips the reap: a displaced generation may still be
 * serving.
 */
export async function runWavedRollout(plan: WavedRolloutPlan, rt: RolloutRuntime): Promise<void> {
  const { sha } = plan

  // LB backend ids are only defined (and only needed) when a wave contains an
  // lb-overlap service; exclusive-only waves skip the stack-output read.
  const backendIdsFor = async (wave: RolloutServicePlan[]): Promise<Record<string, string>> =>
    wave.some((item) => item.strategy !== 'exclusive' || (item.repointBackendKeys?.length ?? 0) > 0) ? rt.readLbBackendIds() : {}

  if (plan.primary) {
    rt.info(`[rollout] wave 1: ${plan.primary.service}`)
    await rt.setPending(plan.primary.service, sha)
    await rt.update([plan.primary.service])
    const generations = await rt.readGenerations()
    const backendIds = await backendIdsFor([plan.primary])
    await activateService(plan.primary, sha, generations, backendIds, rt)
  }

  if (plan.rest.length > 0) {
    rt.info(`[rollout] wave 2: ${plan.rest.map((p) => p.service).join(', ')}`)
    for (const item of plan.rest) await rt.setPending(item.service, sha)
    await rt.update(plan.rest.map((item) => item.service))
    const generations = await rt.readGenerations()
    const backendIds = await backendIdsFor(plan.rest)
    const outcomes = await Promise.allSettled(plan.rest.map((item) => activateService(item, sha, generations, backendIds, rt)))
    const failures = outcomes.flatMap((outcome, index) =>
      outcome.status === 'rejected' ? [`${plan.rest[index]?.service}: ${outcome.reason instanceof Error ? outcome.reason.message : outcome.reason}`] : [],
    )
    if (failures.length > 0) {
      // Promoted services keep serving the new release; failed ones keep their
      // old generation behind the LB. No reap: re-running resumes idempotently.
      throw new Error(`Rollout failed for ${failures.length} service(s): ${failures.join('; ')}`)
    }
  }

  rt.info('[rollout] reaping displaced generations')
  await rt.reap([...(plan.primary ? [plan.primary.service] : []), ...plan.rest.map((item) => item.service)])
}
