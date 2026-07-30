import { engineConfig } from '../config/engine-config'
const appConfig = engineConfig()
import { composeConfig } from '../compose/compose'
import { deriveGenId } from '../lib/gen-id'
import { unionRuntimeSecrets, type RuntimeSecretConsumer } from '../lib/runtime-secrets'
import { type Generation, selectGenerations } from '../lib/select-generations'
import { deployedServices, coHostedServices, collocatedServices, type ServiceDefinition } from '../lib/services'
import { sizing } from '../config/sizing'
import { controlState } from './control'

// Give each service a VM except workers co-hosted on the backend and
// containers collocated on the host in single-VM mode. Load-balanced co-hosts
// and collocated containers still route through the host VM.
export const enabled = deployedServices(appConfig.services, appConfig.singleVM)

// Workers folded into the host backend process under singleVM. Empty in the
// normal split-VM deploy. Their runtime secrets are unioned onto the host VM and
// an `exclusive` one among them forces the host to cut over exclusively.
export const coHosted = coHostedServices(appConfig.services, appConfig.singleVM)

// Containers the boot runner starts on the host VM next to the host container
// under singleVM (placement 'host'). Empty in the normal split-VM deploy.
export const collocated = collocatedServices(appConfig.services, appConfig.singleVM)
export const hostSlug = enabled.find((s) => s.primaryRollout)?.slug

/** Runtime-secret consumers whose secrets a service's VM must carry. In singleVM
 *  the host VM additionally carries every co-hosted worker's and collocated
 *  container's secrets. */
export function secretConsumersFor(svc: ServiceDefinition): RuntimeSecretConsumer[] {
  if (appConfig.singleVM && svc.slug === hostSlug) {
    return [svc.slug, ...coHosted.map((s) => s.slug), ...collocated.map((s) => s.slug)] as RuntimeSecretConsumer[]
  }
  return [svc.slug as RuntimeSecretConsumer]
}

/**
 * Resolves the VM replacement strategy. A single-VM host containing an exclusive worker
 * must also cut over exclusively to avoid concurrent replication-slot consumers.
 * The level-triggered load-balancer reconciler then repairs traffic onto the replacement.
 */
export function effectiveStrategy(svc: ServiceDefinition): ServiceDefinition['replacementStrategy'] {
  if (
    appConfig.singleVM &&
    svc.slug === hostSlug &&
    [...coHosted, ...collocated].some((s) => s.replacementStrategy === 'exclusive')
  ) {
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
  // Collocated containers live on the host VM, so their compose blocks (and a
  // marker of who is collocated) join the host's fingerprint: a change to a
  // collocated image or env rolls the shared generation. Empty outside
  // singleVM, keeping the split-VM fingerprint byte-stable.
  const collocatedSlugs = appConfig.singleVM && svc.slug === hostSlug ? collocated.map((s) => s.slug) : []
  const blockOwners = new Set<string>([svc.slug, ...collocatedSlugs])
  const blocks = Object.values(composeConfig.services)
    .filter((block) => block.profiles.some((profile) => blockOwners.has(profile)))
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
    // Fingerprint key pinned to its original name: the key itself is hashed
    // into every live genId, so renaming it would re-roll every generation.
    runMigrate: svc.runRelease ?? false,
    // Only fold in the strategy when singleVM changes it (host co-hosting an
    // exclusive worker). Keeps the split-VM fingerprint byte-stable so this
    // feature doesn't churn every existing service's genId.
    ...(effectiveStrategy(svc) !== svc.replacementStrategy ? { singleVmStrategy: effectiveStrategy(svc) } : {}),
    bindings: svc.bindings ?? {},
    ...(collocatedSlugs.length > 0 ? { collocated: collocatedSlugs } : {}),
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
