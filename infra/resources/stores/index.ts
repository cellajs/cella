import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { sizing } from '../../config/sizing';
import { appStores } from '../../config/stores.config';
import type { ProvisionContext, StoreOutputs } from '../../lib/stores';
import { isProduction, naming, region, zone } from '../../pulumi-context';
import { configuredOrRandomSecret } from '../configured-secret';
import { privateNetworkId } from '../network';

// The engine facilities handed to every store's provision(). Store modules are
// pure at import time; this module is the single place that binds them to the
// live Pulumi program.
const provisionContext: ProvisionContext = {
  pulumi,
  scaleway,
  naming,
  region,
  zone,
  isProduction,
  sizing: { dbNodeType: sizing.dbNodeType, dbVolumeSize: sizing.dbVolumeSize },
  privateNetworkId,
  configuredOrRandomSecret,
};

// Provision every registered store exactly once (importing this module triggers
// it). Registry order is stable; the first store is primary. This is the single
// seam between the app's store registry and the rest of the Pulumi program.
const results = Object.entries(appStores).map(([id, store]) => {
  store.validate?.();
  return [id, store.provision(provisionContext)] as const;
});

/** The primary store's outputs (empty only if no store is registered). */
export const primaryStoreOutputs: StoreOutputs = results[0]?.[1].outputs ?? {};

/**
 * Every store's outputs, keyed by store id (S11 generic namespacing: the
 * stack exports these as one `storeOutputs` object, `<storeId>.<key>`). The
 * db-exposure/seed CLI reads the primary store's keys from here; the flat
 * db* aliases were retired in the 2026-08 planned break.
 */
export const allStoreOutputs: Record<string, StoreOutputs> = Object.fromEntries(
  results.map(([id, provisioned]) => [id, provisioned.outputs]),
);

/**
 * Runtime-secret values merged across all stores, keyed by runtime-secret id.
 * `secrets.ts` looks these up by the ids the registry (store contributions +
 * `runtime-secrets.config.ts`) declares. A collision means two stores bind the
 * same secret, an app misconfiguration.
 */
export const derivedRuntimeSecretData: Record<string, pulumi.Input<string>> = (() => {
  const merged: Record<string, pulumi.Input<string>> = {};
  for (const [id, provisioned] of results) {
    for (const [secretId, value] of Object.entries(provisioned.secretValues)) {
      if (secretId in merged) {
        throw new Error(`stores: runtime secret '${secretId}' is bound by more than one store (last: '${id}').`);
      }
      merged[secretId] = value;
    }
  }
  return merged;
})();
