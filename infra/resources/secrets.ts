import type * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { protectsStoredData, type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';
import { region, tags } from '../pulumi-context';
import { derivedRuntimeSecretData } from './stores';

// One container per value, in the runtime folder, which only the deploy key reads: the deploy composes each machine's env file from them.

// The values a store supplies (connection strings, CA data) are bound by the store plugins in resources/stores and written as versions here.
// Generated and derived values are made by the operator task ensure-secrets, and database connection strings by ensure-database, straight
// into Secret Manager, so they never pass through the state.

/** The value a store supplies for a runtime secret, or undefined for one the program writes no version of. */
function storeSuppliedData(definition: RuntimeSecretDefinition): pulumi.Input<string> | undefined {
  if (definition.valueSource !== 'engine') return undefined;
  const supplied = derivedRuntimeSecretData[definition.id];
  if (supplied !== undefined) return supplied;
  if (definition.generation === 'random' || definition.derivedFrom || definition.database) return undefined;
  throw new Error(
    `secrets: pulumi-owned secret '${definition.id}' has generation 'manual' but no derived value: add it to derivedRuntimeSecretData.`,
  );
}

/**
 * A runtime secret's container. One whose value protects stored data outlives a destroy and a registry entry that disappears, as the final
 * dump of a teardown needs it, and a setup adopts it again (lib/stack/kept-resources.ts).
 */
function secretContainer(definition: RuntimeSecretDefinition): void {
  const secret = new scaleway.secrets.Secret(
    `secret-${definition.secretName}`,
    { name: definition.secretName, path: RUNTIME_FOLDER, description: definition.description, region, tags },
    { retainOnDelete: protectsStoredData(definition) },
  );
  const supplied = storeSuppliedData(definition);
  if (supplied !== undefined) {
    new scaleway.secrets.Version(`secret-version-${definition.secretName}`, { secretId: secret.id, data: supplied, region });
  }
}

for (const definition of runtimeSecrets) secretContainer(definition);
