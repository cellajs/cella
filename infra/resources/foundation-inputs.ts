import * as pulumi from '@pulumi/pulumi'
import { foundationStackName, stackScope } from '../pulumi-context'

/**
 * Shared foundation values the generation slice consumes (compute, compose-env).
 * In a foundation/all-scope stack the owning modules register their live values
 * as they evaluate (deferred promises make registration order irrelevant). In a
 * `<mode>-gen-<slug>` stack nothing registers; every key resolves from the
 * foundation stack's `foundationInputs` output via a StackReference. This seam
 * is why the generation slice never imports the foundation resource modules.
 */
export interface FoundationInputValues {
  privateNetworkId: string
  registryEndpoint: string
  bootDiagBucketName: string
  frontendBucketName: string
  /** The LB's stable private-network address (internal routes, lb-internal.ts). */
  lbInternalAddress: string
  /** Runtime secret id per configured secret (secrets.ts secretIds). */
  runtimeSecretIds: Record<string, string>
}

// Keyed maps sidestep TS's correlated-union limits on generic record writes;
// the single read-side cast below is the only widening.
const registered = new Map<keyof FoundationInputValues, pulumi.Output<unknown>>()
const waiters = new Map<keyof FoundationInputValues, Array<(value: pulumi.Output<unknown>) => void>>()

let stackRef: pulumi.StackReference | undefined
function referenceInput<K extends keyof FoundationInputValues>(key: K): pulumi.Output<FoundationInputValues[K]> {
  stackRef ??= new pulumi.StackReference('foundation', { name: foundationStackName })
  return stackRef.getOutput('foundationInputs').apply((bundle) => {
    const value = (bundle as FoundationInputValues | undefined)?.[key]
    if (value === undefined) throw new Error(`foundation stack '${foundationStackName}' does not export foundationInputs.${key}`)
    return value
  })
}

/** Register a live foundation value; called by the owning resource module. */
export function registerFoundationInput<K extends keyof FoundationInputValues>(key: K, value: pulumi.Input<FoundationInputValues[K]>): void {
  const output: pulumi.Output<unknown> = pulumi.output(value)
  registered.set(key, output)
  for (const resolve of waiters.get(key) ?? []) resolve(output)
  waiters.delete(key)
}

/** A foundation value: live (same stack) or referenced (generations stack). */
export function foundationInput<K extends keyof FoundationInputValues>(key: K): pulumi.Output<FoundationInputValues[K]> {
  if (stackScope === 'generations') return referenceInput(key)
  // Values enter through the typed register signature above; the map widens
  // them to unknown, so the read narrows back to the key's declared type.
  const narrow = (value: pulumi.Output<unknown>) => value as pulumi.Output<FoundationInputValues[K]>
  const live = registered.get(key)
  if (live) return narrow(live)
  // Deferred: the owning module registers during program evaluation; module
  // import order stays a non-concern. The promise settles before Pulumi
  // finishes because index.ts imports every foundation module, and
  // pulumi.output flattens the nested Output the promise resolves with.
  const pending: Promise<unknown> = new Promise((resolve) => {
    const list = waiters.get(key) ?? []
    list.push(resolve)
    waiters.set(key, list)
  })
  return narrow(pulumi.output(pending))
}

/** One secret's Scaleway id from the foundation's runtime-secret map. */
export function foundationSecretId(id: string): pulumi.Output<string> {
  return foundationInput('runtimeSecretIds').apply((map) => {
    const secretId = map[id]
    if (!secretId) throw new Error(`runtime secret '${id}' is not present in the foundation's runtimeSecretIds`)
    return secretId
  })
}

/** The full bundle, exported by the foundation stack as `foundationInputs`. */
export function foundationInputsBundle(): pulumi.Output<FoundationInputValues> {
  return pulumi.output({
    privateNetworkId: foundationInput('privateNetworkId'),
    registryEndpoint: foundationInput('registryEndpoint'),
    bootDiagBucketName: foundationInput('bootDiagBucketName'),
    frontendBucketName: foundationInput('frontendBucketName'),
    lbInternalAddress: foundationInput('lbInternalAddress'),
    runtimeSecretIds: foundationInput('runtimeSecretIds'),
  })
}
