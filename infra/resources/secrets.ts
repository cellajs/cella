import type * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { type RuntimeSecretDefinition, type RuntimeSecretId, runtimeSecrets } from '../lib/runtime-secrets';
import { secretPathFor } from '../lib/scaleway/secret-paths';
import { mode, naming, region, tags } from '../pulumi-context';
import { configuredOrRandomSecret } from './configured-secret';
import { derivedRuntimeSecretData } from './stores';

// Folder per secret: `/<slug>-<mode>/<service>/` for single-consumer secrets, `/<slug>-<mode>/shared/` for multi-consumer ones. The path is the security boundary the VM grant is conditioned on, so it is derived from the consumer list, never hand-assigned.
const secretPath = (definition: RuntimeSecretDefinition) => secretPathFor(definition, naming.slug, mode);

/** One-time imports for operator secret containers created outside Pulumi, as `secretName=region/uuid`. The CLI self-heals this drift, so the hook is for direct runs or forced ids. */
function parseOperatorSecretImports(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const map: Record<string, string> = {};
  for (const pair of raw.split(',')) {
    const entry = pair.trim();
    if (!entry) continue;
    const eq = entry.indexOf('=');
    const name = eq === -1 ? '' : entry.slice(0, eq).trim();
    const id = eq === -1 ? '' : entry.slice(eq + 1).trim();
    if (!name || !id)
      throw new Error(`OPERATOR_SECRET_IMPORTS: malformed entry '${entry}' (expected name=region/uuid).`);
    map[name] = id;
  }
  return map;
}

const operatorSecretImports = parseOperatorSecretImports(process.env.OPERATOR_SECRET_IMPORTS);

function createSecretContainer(
  name: string,
  path: string,
  description: string,
  opts?: { retainOnDelete?: boolean; importId?: string },
) {
  return new scaleway.secrets.Secret(
    `secret-${name}`,
    {
      name,
      path,
      description,
      region,
      tags,
    },
    {
      retainOnDelete: opts?.retainOnDelete,
      import: opts?.importId,
    },
  );
}

function createSecretVersion(name: string, secretId: pulumi.Input<string>, data: pulumi.Input<string>) {
  return new scaleway.secrets.Version(`secret-version-${name}`, {
    secretId,
    data,
    region,
  });
}

// The `generated-<secretName>` resource names are the Pulumi identities of the live secret values; renaming re-creates them.
function pulumiOwnedRuntimeSecret(configKey: string, name: string) {
  return configuredOrRandomSecret(configKey, `generated-${name}`);
}

// Store-derived values (connection strings, CA data) are bound by the store plugins in resources/stores; other pulumi-owned values resolve from registry generation metadata below.

function pulumiRuntimeSecretData(definition: RuntimeSecretDefinition): pulumi.Input<string> {
  const derived = derivedRuntimeSecretData[definition.id];
  if (derived !== undefined) return derived;
  if (definition.generation === 'random') return pulumiOwnedRuntimeSecret(definition.id, definition.secretName);
  throw new Error(
    `secrets: pulumi-owned secret '${definition.id}' has generation 'manual' but no derived value: add it to derivedRuntimeSecretData.`,
  );
}

// Registry-driven secret containers

const secretResources = Object.fromEntries(
  runtimeSecrets.map((definition) => {
    const isOperator = definition.valueSource === 'operator';
    // Pulumi creates every container and operators add versions through the CLI. Operator values are retained when a registry entry disappears, so orphans are cleaned up by hand.
    const secret = createSecretContainer(definition.secretName, secretPath(definition), definition.description, {
      retainOnDelete: isOperator,
      importId: isOperator ? operatorSecretImports[definition.secretName] : undefined,
    });
    if (!isOperator) {
      createSecretVersion(definition.secretName, secret.id, pulumiRuntimeSecretData(definition));
    }
    return [definition.id, secret];
  }),
);

/** Runtime secret ids to Scaleway secret ids. The key type is the literal id union, so a typo is a compile error; Object.fromEntries widens, hence the cast. */
export const secretIds = Object.fromEntries(
  Object.entries(secretResources).map(([id, secret]) => [id, secret.id]),
) as Record<RuntimeSecretId, pulumi.Output<string>>;
