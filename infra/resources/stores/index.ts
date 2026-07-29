import type * as pulumi from '@pulumi/pulumi'
import { appStores } from '../../config/stores.config'
import type { StoreOutputs } from '../../lib/stores'

// Provision every registered store exactly once (importing this module triggers
// it). Registry order is stable; the first store is primary. This is the single
// seam between the app's store registry and the rest of the Pulumi program.
const results = Object.entries(appStores).map(([id, store]) => {
  store.validate?.()
  return [id, store.provision()] as const
})

/** The primary store's outputs (empty only if no store is registered). */
export const primaryStoreOutputs: StoreOutputs = results[0]?.[1].outputs ?? {}

/**
 * Runtime-secret values merged across all stores, keyed by runtime-secret id.
 * `secrets.ts` looks these up by the ids declared in `runtime-secrets.config.ts`.
 * A collision means two stores bind the same secret, an app misconfiguration.
 */
export const derivedRuntimeSecretData: Record<string, pulumi.Input<string>> = (() => {
  const merged: Record<string, pulumi.Input<string>> = {}
  for (const [id, provisioned] of results) {
    for (const [secretId, value] of Object.entries(provisioned.secretValues)) {
      if (secretId in merged) {
        throw new Error(`stores: runtime secret '${secretId}' is bound by more than one store (last: '${id}').`)
      }
      merged[secretId] = value
    }
  }
  return merged
})()
