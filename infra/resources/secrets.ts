import * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { type RuntimeSecretDefinition, type RuntimeSecretId, runtimeSecrets } from '../lib/runtime-secrets';
import { secretCopies } from '../lib/scaleway/secret-paths';
import { mode, naming, region, tags } from '../pulumi-context';
import { configuredOrRandomSecret } from './configured-secret';
import { derivedRuntimeSecretData } from './stores';

// One copy per consumer, in `/<slug>-<mode>/<service>/`. The folder is the security boundary the machine grant is conditioned on, so it is derived
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
 * its folder did not move: a new resource at the same name and path would be refused.
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

// The `generated-<secretName>` resource names are the Pulumi identities of the live secret values; renaming re-creates them.
function pulumiOwnedRuntimeSecret(configKey: string, name: string) {
  return configuredOrRandomSecret(configKey, `generated-${name}`);
}

// Store-derived values (connection strings, CA data) are bound by the store plugins in resources/stores; other pulumi-owned values resolve from registry generation metadata below.

// One value per secret: a derived secret reads its source's value, which must not create a second random resource.
const pulumiValues = new Map<RuntimeSecretId, pulumi.Input<string>>();

function pulumiRuntimeSecretData(definition: RuntimeSecretDefinition): pulumi.Input<string> {
  const known = pulumiValues.get(definition.id);
  if (known !== undefined) return known;
  const value = resolvePulumiRuntimeSecretData(definition);
  pulumiValues.set(definition.id, value);
  return value;
}

function resolvePulumiRuntimeSecretData(definition: RuntimeSecretDefinition): pulumi.Input<string> {
  const derived = derivedRuntimeSecretData[definition.id];
  if (derived !== undefined) return derived;
  if (definition.derivedFrom) {
    const { secretId, derive } = definition.derivedFrom;
    const source = runtimeSecrets.find((candidate) => candidate.id === secretId);
    if (!source) throw new Error(`secrets: '${definition.id}' derives from unknown secret '${secretId}'.`);
    return pulumi.output(pulumiRuntimeSecretData(source)).apply(derive);
  }
  if (definition.generation === 'random') return pulumiOwnedRuntimeSecret(definition.id, definition.secretName);
  throw new Error(
    `secrets: pulumi-owned secret '${definition.id}' has generation 'manual' but no derived value: add it to derivedRuntimeSecretData.`,
  );
}

// Registry-driven secret containers

function secretContainers(definition: RuntimeSecretDefinition): Record<string, pulumi.Output<string>> {
  const isOperator = definition.valueSource === 'operator';
  const copies = secretCopies(definition, naming.slug, mode);
  return Object.fromEntries(
    copies.map(({ service, path }) => {
      const copy = { service, path, only: copies.length === 1 };
      // Pulumi creates every container and operators add versions through the CLI. Operator values are retained when a registry entry disappears, so orphans are cleaned up by hand.
      const secret = createSecretContainer(definition.secretName, copy, definition.description, {
        retainOnDelete: isOperator,
        importId: isOperator ? operatorSecretImports[`${definition.secretName}@${service}`] : undefined,
      });
      if (!isOperator) createSecretVersion(definition.secretName, copy, secret.id, pulumiRuntimeSecretData(definition));
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
