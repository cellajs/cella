import type * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import { RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';
import { region, tags } from '../pulumi-context';
import { derivedRuntimeSecretData } from './stores';

// One container per value, in the runtime folder, which only the deploy key reads: the deploy composes each machine's env file from them.

/** Imports of operator secret containers that exist outside the state, as `secretName=region/uuid`: a setup fills it for its first `up` when a teardown kept them. */
function parseOperatorSecretImports(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const entry = pair.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    const name = eq === -1 ? '' : entry.slice(0, eq).trim();
    const id = eq === -1 ? '' : entry.slice(eq + 1).trim();
    if (!name || !id) throw new Error(`OPERATOR_SECRET_IMPORTS: malformed entry '${entry}' (expected name=region/uuid).`);
    map[name] = id;
  }
  return map;
}

const operatorSecretImports = parseOperatorSecretImports(process.env.OPERATOR_SECRET_IMPORTS);

/**
 * The resource name a secret's container had while each consumer held a copy: its first consumer's copy is the one the move to the runtime
 * folder keeps (tasks/move-secret-paths.ts), so the alias carries its id and versions over.
 */
const copyAlias = (resource: string, definition: RuntimeSecretDefinition) => [{ name: `${resource}@${definition.services[0]}` }];

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

/** A runtime secret's container. Operator values are retained when a registry entry disappears, so orphans are cleaned up by hand. */
function secretContainer(definition: RuntimeSecretDefinition): void {
  const isOperator = definition.valueSource === 'operator';
  const secret = new scaleway.secrets.Secret(
    `secret-${definition.secretName}`,
    { name: definition.secretName, path: RUNTIME_FOLDER, description: definition.description, region, tags },
    {
      retainOnDelete: isOperator,
      import: isOperator ? operatorSecretImports[definition.secretName] : undefined,
      aliases: copyAlias(`secret-${definition.secretName}`, definition),
    },
  );
  const supplied = storeSuppliedData(definition);
  if (supplied !== undefined) {
    new scaleway.secrets.Version(
      `secret-version-${definition.secretName}`,
      { secretId: secret.id, data: supplied, region },
      { aliases: copyAlias(`secret-version-${definition.secretName}`, definition) },
    );
  }
}

for (const definition of runtimeSecrets) secretContainer(definition);
