import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { generalConfig } from '../../config/general.config';
import { appStores } from '../../config/stores.config';
import type { ProvisionContext, StoreOutputs } from '../../lib/stores';
import { isProduction, naming, region, zone } from '../../pulumi-context';
import { privateNetworkId } from '../network';

// The engine facilities handed to every store's provision(). Store modules are pure at import time; this module is the only place that binds them to the live Pulumi program.
const provisionContext: ProvisionContext = {
  pulumi,
  scaleway,
  naming,
  region,
  zone,
  isProduction,
  sizing: { dbNodeType: generalConfig.database.nodeType, dbVolumeSize: generalConfig.database.volumeSizeGb },
  privateNetworkId,
};

// Importing this module provisions every registered store exactly once, in registry order.
const results = Object.entries(appStores).map(([id, store]) => [id, store.provision(provisionContext)] as const);

/** Every store's outputs, keyed by store id; the stack exports these as one `storeOutputs` object addressed `<storeId>.<key>`. */
export const allStoreOutputs: Record<string, StoreOutputs> = Object.fromEntries(results.map(([id, provisioned]) => [id, provisioned.outputs]));

/** Runtime-secret values merged across stores, keyed by runtime-secret id. A collision means two stores bind the same secret, which is an app misconfiguration. */
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
