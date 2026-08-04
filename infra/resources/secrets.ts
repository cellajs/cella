import type * as pulumi from '@pulumi/pulumi';
import * as scaleway from '@pulumiverse/scaleway';
import { type RuntimeSecretDefinition, type RuntimeSecretId, runtimeSecrets } from '../lib/runtime-secrets';
import { secretPathFor } from '../lib/scaleway/vm-reader-secret';
import { mode, naming, region, tags } from '../pulumi-context';
import { configuredOrRandomSecret } from './configured-secret';
import { derivedRuntimeSecretData } from './stores';

// Folder per secret (REQ-8): `/<slug>-<mode>/<service>/` for single-consumer
// secrets, `/<slug>-<mode>/shared/` for multi-consumer ones. The path is the
// security boundary (the VM grant is conditioned on these prefixes), so it is
// derived from the consumer list, never hand-assigned. Path updates apply
// in-place (same secret id, so manifests and hydration are unaffected).
const secretPath = (definition: RuntimeSecretDefinition) => secretPathFor(definition, naming.slug, mode);

/**
 * Parses one-time imports for operator secret containers created outside Pulumi.
 * Entries use `secretName=region/uuid`; remove the variable after the targeted update.
 * The normal CLI self-heals this drift, so the hook is for direct runs or forced IDs.
 */
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

// Helper: create a Secret container, optionally with a Version

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
      aliases: [{ type: 'scaleway:index/secret:Secret' }],
      retainOnDelete: opts?.retainOnDelete,
      import: opts?.importId,
    },
  );
}

function createSecretVersion(name: string, secretId: pulumi.Input<string>, data: pulumi.Input<string>) {
  return new scaleway.secrets.Version(
    `secret-version-${name}`,
    {
      secretId,
      data,
      region,
    },
    { aliases: [{ type: 'scaleway:index/secretVersion:SecretVersion' }] },
  );
}

// Resource names (`generated-<secretName>`) are load-bearing: they are the
// shipped Pulumi identities of the live secret values.
function pulumiOwnedRuntimeSecret(configKey: string, name: string) {
  return configuredOrRandomSecret(configKey, `generated-${name}`);
}

// Store-derived secret values (connection strings, CA data) are provisioned and
// bound by the store plugins in resources/stores; other pulumi-owned values
// resolve generically from registry generation metadata below.

function pulumiRuntimeSecretData(definition: RuntimeSecretDefinition): pulumi.Input<string> {
  const derived = derivedRuntimeSecretData[definition.id];
  if (derived !== undefined) return derived;
  if (definition.generation === 'random') return pulumiOwnedRuntimeSecret(definition.id, definition.secretName);
  throw new Error(
    `secrets: pulumi-owned secret '${definition.id}' has generation 'manual' but no derived value — add it to derivedRuntimeSecretData.`,
  );
}

// Registry-driven secret containers

const secretResources = Object.fromEntries(
  runtimeSecrets.map((definition) => {
    const isOperator = definition.valueSource === 'operator';
    // Pulumi creates every secret container; operators add versions through the CLI.
    // Retain operator values when registry entries disappear, leaving manual orphan cleanup.
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

// Exports: secret IDs for container references

/** Map of runtime secret IDs to their Scaleway Secret IDs. The key type is the
 *  literal id union, so a typo'd lookup is a compile error before
 *  undefined Output at deploy time (Object.fromEntries widens, hence the cast). */
export const secretIds = Object.fromEntries(
  Object.entries(secretResources).map(([id, secret]) => [id, secret.id]),
) as Record<RuntimeSecretId, pulumi.Output<string>>;
