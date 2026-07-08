import { appConfig } from '../../shared'
import { composeConfig } from '../compose/compose'
import { deriveGenId } from '../lib/gen-id'
import { unionRuntimeSecrets, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { deployedServices, coHostedServices, type ServiceDefinition } from '../lib/services'
import { infra } from '../pulumi-context'
import { controlState } from './control'

// Services that get their own dedicated VM. Under `appConfig.singleVM` the
// enabled `coHosted` workers (cdc/yjs/ai) are folded into the backend process
// and do NOT get their own VM (see `deployedServices`); the load balancer still
// routes to them via the host VM (see `serviceGenerationIps`). Each remaining
// service runs on its own dedicated VM (the multi-fork shared-workers placement
// is guarded below).
export const enabled = deployedServices(appConfig.services, appConfig.singleVM).map((svc) => {
  const placement = svc.placement ?? 'dedicated-vm'
  if (placement !== 'dedicated-vm') {
    throw new Error(`compute: placement '${placement}' for service '${svc.slug}' is not yet supported`)
  }
  return svc
})

// Workers folded into the host backend process under singleVM. Empty in the
// normal split-VM deploy. Their runtime secrets are unioned onto the host VM and
// an `exclusive` one among them forces the host to cut over exclusively.
export const coHosted = coHostedServices(appConfig.services, appConfig.singleVM)
export const hostSlug = enabled.find((s) => s.primaryRollout)?.slug

/** Runtime-secret consumers whose secrets a service's VM must carry. In singleVM
 *  the host VM additionally carries every co-hosted worker's secrets (the folded
 *  workers read them from the same process). */
export function secretConsumersFor(svc: ServiceDefinition): RuntimeSecretConsumer[] {
  if (appConfig.singleVM && svc.slug === hostSlug) {
    return [svc.slug, ...coHosted.map((s) => s.slug)] as RuntimeSecretConsumer[]
  }
  return [svc.slug as RuntimeSecretConsumer]
}

/** The replacement strategy a service's VM actually uses. Under singleVM a host
 *  co-hosting an `exclusive` worker (cdc holds the single replication slot) must
 *  itself cut over exclusively: two overlapping host generations would double-
 *  consume the slot. */
export function effectiveStrategy(svc: ServiceDefinition): ServiceDefinition['replacementStrategy'] {
  if (appConfig.singleVM && svc.slug === hostSlug && coHosted.some((s) => s.replacementStrategy === 'exclusive')) {
    return 'exclusive'
  }
  return svc.replacementStrategy
}

export interface Generation {
  /** Content-addressed generation id (resource suffix). */
  id: string
  /** Image SHA baked into this generation. */
  sha: string
}

/**
 * Static, synchronously-known configuration that DEFINES a generation. Hashed
 * into the genId so any change here (image reference, consumed env var names,
 * inter-service bindings, runtime-secret manifest metadata, base image, port)
 * rolls a genuinely new generation. Deliberately excludes the rendered
 * cloud-init (a Pulumi Output, unavailable at plan time) and secret VALUES.
 */
function serviceFingerprint(svc: ServiceDefinition): unknown {
  const blocks = Object.values(composeConfig.services)
    .filter((block) => block.profiles.includes(svc.slug))
    .map((block) => ({ image: block.image, ports: block.ports ?? [], environment: block.environment ?? {} }))
  // Union across secret consumers so the singleVM host's genId also captures the
  // co-hosted workers' secret manifest (any change rolls a new generation).
  const secrets = unionRuntimeSecrets(secretConsumersFor(svc)).map((definition) => ({
    secretName: definition.secretName,
    envVar: definition.envVar,
    required: definition.required,
  }))
  return {
    slug: svc.slug,
    port: svc.healthPort,
    runMigrate: svc.runMigrate ?? false,
    // Only fold in the strategy when singleVM changes it (host co-hosting an
    // exclusive worker). Keeps the split-VM fingerprint byte-stable so this
    // feature doesn't churn every existing service's genId.
    ...(effectiveStrategy(svc) !== svc.replacementStrategy ? { singleVmStrategy: effectiveStrategy(svc) } : {}),
    bindings: svc.bindings ?? {},
    blocks,
    secrets,
    computeImage: typeof infra.computeImage === 'string' ? infra.computeImage : 'dynamic',
  }
}

/**
 * Generations a service materialises: the live one (`active`, else the pending
 * intent on first deploy) and the pending generation being rolled in. This
 * derives the content-addressed id for a pending SHA (the genId authority).
 * Deduplicated by id. When a pending SHA hashes to the active id (a same-config
 * redeploy) it collapses to a single VM. Index 0 is the live binding target.
 * The old generation is reaped once the new one is healthy, so no powered-off
 * rollback VM lingers; rollback is a revert commit + redeploy.
 */
export function activeGenerations(svc: ServiceDefinition): Generation[] {
  const entry = controlState.rollout[svc.slug]
  const fingerprint = serviceFingerprint(svc)
  const pending: Generation | undefined = entry?.pendingSha ? { id: deriveGenId(entry.pendingSha, fingerprint), sha: entry.pendingSha } : undefined
  const active: Generation | undefined = entry?.active ? { id: entry.active.id, sha: entry.active.sha } : undefined

  const generations: Generation[] = []
  const seen = new Set<string>()
  const add = (g?: Generation) => {
    if (g && !seen.has(g.id)) {
      seen.add(g.id)
      generations.push(g)
    }
  }

  // Exclusive services (cdc) hold a single resource the platform permits one
  // consumer of (the replication slot), so there is no overlap: materialise
  // ONLY the live generation (the pending intent, else active), which replaces
  // the old VM in place. Under singleVM the host inherits this when it co-hosts
  // an exclusive worker (it now holds the slot in-process).
  if (effectiveStrategy(svc) === 'exclusive') {
    add(pending ?? active)
    if (generations.length === 0) add({ id: deriveGenId('latest', fingerprint), sha: 'latest' })
    return generations
  }

  // Live binding target first: the active generation, or the pending one on a
  // first deploy that has no active yet.
  add(active ?? pending)
  add(pending)

  if (generations.length === 0) {
    // First provision, before any deploy seeds the ledger: a single default gen.
    const sha = 'latest'
    add({ id: deriveGenId(sha, fingerprint), sha })
  }
  return generations
}
