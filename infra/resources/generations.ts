import { engineConfig } from '../config/engine-config'
const appConfig = engineConfig()
import { composeConfig } from '../compose/compose'
import { deriveGenId } from '../lib/gen-id'
import { unionRuntimeSecrets, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { type Generation, selectGenerations } from '../lib/select-generations'
import { deployedServices, coHostedServices, type ServiceDefinition } from '../lib/services'
import { sizing } from '../config/sizing'
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

export type { Generation } from '../lib/select-generations'

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
    computeImage: typeof sizing.computeImage === 'string' ? sizing.computeImage : 'dynamic',
  }
}

/**
 * The live and pending content-addressed generations for a service. Selection
 * (exclusive collapse, first-provision fallback) lives in
 * lib/select-generations.ts as a pure function; single-VM hosts inherit
 * exclusivity when they own the replication slot in-process. Old generations
 * are reaped after promotion; rollback uses a revert and redeploy.
 */
export function activeGenerations(svc: ServiceDefinition): Generation[] {
  const fingerprint = serviceFingerprint(svc)
  return selectGenerations(controlState.rollout[svc.slug], {
    exclusive: effectiveStrategy(svc) === 'exclusive',
    genIdFor: (sha) => deriveGenId(sha, fingerprint),
  })
}
