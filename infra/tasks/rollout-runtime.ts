import type { GenerationMetadata } from '../lib/generation-metadata'
import {
  type ControlContext,
  controlContextForStack,
  promote,
  readControlState,
  type ServiceRollout,
  setPending,
  updateServiceRollout,
} from '../lib/stack/control-store'
import { createPulumiDriver, destroyStack, listStackNames, type PulumiDriver } from '../lib/stack/pulumi-driver'
import { generationStackName, stackTopology } from '../lib/stack/topology'
import { sleep } from './args'
import { createLbGetServers, createLbSetServers } from './cutover'
import { createFetchProbe, pollForVersion } from './wait-for-version'
import type { RolloutRuntime } from './rollout'

// Cold-boot budget: a fresh VM generation pulls its image, runs migrate, and
// starts the app before it serves the new SHA (~110s observed). The gate must
// outlast that, so keep a generous attempt count (120 * 3s = 360s).
const deployHealthAttempts = 120
const deployHealthIntervalMs = 3000
const deployHealthTimeoutMs = 8000

export interface RolloutRuntimeOptions {
  stack: string
  /** Scaleway LB zone; defaults to `<region>-1` from the environment. */
  lbZone?: string
  /** Pulumi driver; defaults to the Automation API driver for the stack. */
  driver?: PulumiDriver
}

/**
 * The live RolloutRuntime: full-stack Pulumi updates, the S3 control object,
 * the Scaleway LB REST API, and public health polling. Control-object access is
 * lazily resolved; without S3 credentials rollout state is not recorded (reads
 * return undefined, writes are skipped with a warning).
 */
export function createRolloutRuntime(options: RolloutRuntimeOptions): RolloutRuntime {
  const { stack } = options
  const topology = stackTopology()
  // Foundation updates under micro must run foundation-scoped (generation
  // stacks match on their name, so the env cannot mis-scope them).
  if (topology === 'micro') process.env.INFRA_STACK_SCOPE = 'foundation'
  const foundationDriver = options.driver ?? createPulumiDriver(stack)
  // Micro topology: one driver per touched service's generation stack.
  const generationDrivers = new Map<string, PulumiDriver>()
  const touchedServices = new Set<string>()
  const generationDriver = (service: string): PulumiDriver => {
    touchedServices.add(service)
    let driver = generationDrivers.get(service)
    if (!driver) {
      driver = createPulumiDriver(generationStackName(stack, service))
      generationDrivers.set(service, driver)
    }
    return driver
  }
  const zone = options.lbZone ?? `${process.env.SCW_DEFAULT_REGION ?? process.env.REGION ?? 'fr-par'}-1`
  const secretKey = process.env.SCW_SECRET_KEY

  let controlCtxPromise: Promise<ControlContext | null> | undefined
  const controlCtx = (): Promise<ControlContext | null> => {
    controlCtxPromise ??= controlContextForStack(stack, (msg) => console.warn(`[deploy] ${msg}`))
    return controlCtxPromise
  }

  const requireLbKey = (): string => {
    if (!secretKey) throw new Error('SCW_SECRET_KEY is required for LB cutover')
    return secretKey
  }

  return {
    async update(services: string[]) {
      if (topology === 'monolith') {
        await foundationDriver.update()
        return
      }
      // Micro: each service's generation stack updates independently, in
      // parallel; the foundation stack is untouched during a rollout.
      await Promise.all(services.map((service) => generationDriver(service).update()))
    },
    async reap(services: string[]) {
      if (topology === 'monolith') {
        await foundationDriver.update()
        // Leftover generation stacks (a revert from the micro topology) hold
        // displaced VMs; an exclusive worker's old VM would keep its
        // replication slot until destroyed.
        const genStacks = (await listStackNames()).filter((name) => name.startsWith(`${stack}-gen-`))
        for (const name of genStacks) {
          console.info(`[reap] destroying leftover generation stack '${name}'`)
          await destroyStack(name)
        }
        return
      }
      // Micro: generation stacks drop their displaced VMs; the foundation
      // update drops generations whose active pointer moved off its plane
      // (the adoption deploy's old monolith VMs).
      await Promise.all(services.map((service) => generationDriver(service).update()))
      await foundationDriver.update()
    },
    async readGenerations(): Promise<GenerationMetadata[]> {
      if (topology === 'monolith') return foundationDriver.output<GenerationMetadata[]>('computeGenerationMetadata')
      const perStack = await Promise.all(
        [...touchedServices].map((service) => generationDriver(service).output<GenerationMetadata[]>('computeGenerationMetadata')),
      )
      return perStack.flat()
    },
    // LB pools always live on the foundation stack.
    readLbBackendIds: () => foundationDriver.output<Record<string, string>>('lbBackendIds'),
    async currentRollout(service: string): Promise<ServiceRollout | undefined> {
      const ctx = await controlCtx()
      if (!ctx) return undefined
      const { state } = await readControlState(ctx.s3, ctx.bucket, ctx.controlKey)
      return state.rollout[service]
    },
    async setPending(service: string, sha: string) {
      const ctx = await controlCtx()
      if (!ctx) return
      await updateServiceRollout(ctx.s3, ctx.bucket, ctx.controlKey, service, (cur) => setPending(cur, sha))
    },
    async promote(service: string, gen: { id: string; sha: string }) {
      const ctx = await controlCtx()
      if (!ctx) return
      // The plane provisioning pending generations under this topology; it is
      // recorded on the active pointer so each plane reaps only its own VMs.
      const plane = topology === 'micro' ? 'generation' : 'foundation'
      await updateServiceRollout(ctx.s3, ctx.bucket, ctx.controlKey, service, (cur) => promote(cur, { ...gen, plane }))
    },
    async lbGetServers(backendId: string) {
      return createLbGetServers({ secretKey: requireLbKey(), zone, backendId })()
    },
    async lbSetServers(backendId: string, ips: string[]) {
      return createLbSetServers({ secretKey: requireLbKey(), zone, backendId })(ips)
    },
    async healthGate(url: string, sha: string) {
      const out = await pollForVersion({
        url,
        expectedSha: sha,
        probe: createFetchProbe(deployHealthTimeoutMs),
        attempts: deployHealthAttempts,
        intervalMs: deployHealthIntervalMs,
        sleep,
      })
      return out.ok
    },
    sleep,
    info: (msg: string) => console.info(msg),
  }
}
