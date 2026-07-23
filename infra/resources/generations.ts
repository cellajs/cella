import { engineConfig } from '../config/engine-config'
const appConfig = engineConfig()
import { composeConfig } from '../compose/compose'
import { deriveGenId } from '../lib/gen-id'
import { unionRuntimeSecrets, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { deployedServices, coHostedServices, type ServiceDefinition } from '../lib/services'
import { infra } from '../pulumi-context'
import { controlState } from './control'

// Give each service a VM except workers co-hosted on the backend in single-VM mode.
// Load-balanced co-hosts still route through the host VM; shared-worker placement is guarded below.
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

/**
 * Resolves the VM replacement strategy. A single-VM host containing an exclusive worker
 * must also cut over exclusively to avoid concurrent replication-slot consumers.
 * The level-triggered load-balancer reconciler then repairs traffic onto the replacement.
 */
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
 * Returns the live and pending content-addressed generations, deduplicated by ID.
 * The first entry is the binding target; equal active/pending IDs collapse to one VM.
 * Old generations are reaped after promotion, so rollback uses a revert and redeploy.
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

// Provision only the selected generation for exclusive services such as CDC.
// Single-VM hosts inherit exclusivity when they own the replication slot in-process.
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
    // First provision, before any deploy initializes the control object: a single default gen.
    const sha = 'latest'
    add({ id: deriveGenId(sha, fingerprint), sha })
  }
  return generations
}
