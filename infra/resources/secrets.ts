import type * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { type RuntimeSecretDefinition, type RuntimeSecretId, runtimeSecrets } from '../lib/runtime-secrets';
import { secretCopies } from '../lib/scaleway/secret-paths';
import { region, tags } from '../pulumi-context';
import { derivedRuntimeSecretData } from './stores';

// One copy per consumer, in `/<service>/`. The folder is the security boundary the machine grant is conditioned on, so it is derived
// from the consumer list, never hand-assigned, and a grant names its own folder only.

/** Imports of operator secret containers that exist outside the state, as `secretName@service=region/uuid`: a setup fills it for its first `up` when a teardown kept them. */
function parseOperatorSecretImports(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const entry = pair.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    const name = eq === -1 ? '' : entry.slice(0, eq).trim();
    const id = eq === -1 ? '' : entry.slice(eq + 1).trim();
    if (!name || !id) throw new Error(`OPERATOR_SECRET_IMPORTS: malformed entry '${entry}' (expected name@service=region/uuid).`);
    map[name] = id;
  }
  return map;
}

const operatorSecretImports = parseOperatorSecretImports(process.env.OPERATOR_SECRET_IMPORTS);

/**
 * The container of one copy. A secret of one consumer keeps the resource name it had before copies (`secret-<name>`), through an alias, as
 * its folder did not move: a new resource at the same name and path would be refused. The provider updates a changed `path` in place, so a
 * container whose folder moves keeps its id and its versions.
 */
function createSecretContainer(
  name: string,
  copy: { service: string; path: string; only: boolean },
  description: string,
  opts?: { retainOnDelete?: boolean; importId?: string },
) {
  return new scaleway.secrets.Secret(
    `secret-${name}@${copy.service}`,
    { name, path: copy.path, description, region, tags },
    { retainOnDelete: opts?.retainOnDelete, import: opts?.importId, aliases: copy.only ? [{ name: `secret-${name}` }] : undefined },
  );
}

function createSecretVersion(name: string, copy: { service: string; only: boolean }, secretId: pulumi.Input<string>, data: pulumi.Input<string>) {
  return new scaleway.secrets.Version(
    `secret-version-${name}@${copy.service}`,
    { secretId, data, region },
    { aliases: copy.only ? [{ name: `secret-version-${name}` }] : undefined },
  );
}

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

// Registry-driven secret containers

function secretContainers(definition: RuntimeSecretDefinition): Record<string, pulumi.Output<string>> {
  const isOperator = definition.valueSource === 'operator';
  const copies = secretCopies(definition);
  return Object.fromEntries(
    copies.map(({ service, path }) => {
      const copy = { service, path, only: copies.length === 1 };
      // Pulumi creates every container and operators add versions through the CLI. Operator values are retained when a registry entry disappears, so orphans are cleaned up by hand.
      const secret = createSecretContainer(definition.secretName, copy, definition.description, {
        retainOnDelete: isOperator,
        importId: isOperator ? operatorSecretImports[`${definition.secretName}@${service}`] : undefined,
      });
      const supplied = storeSuppliedData(definition);
      if (supplied !== undefined) createSecretVersion(definition.secretName, copy, secret.id, supplied);
      return [service, secret.id];
    }),
  );
}

/**
 * Runtime secret ids to the Scaleway secret id of each consumer's copy. The key type is the literal id union, so a typo is a compile error;
 * Object.fromEntries widens, hence the cast.
 */
export const secretIds = Object.fromEntries(runtimeSecrets.map((definition) => [definition.id, secretContainers(definition)])) as Record<
  RuntimeSecretId,
  Record<string, pulumi.Output<string>>
>;
