import { randomBytes } from 'node:crypto';
import { generatedRuntimeSecrets, type RuntimeSecretDefinition, runtimeSecrets } from '../lib/runtime-secrets';
import { createSecretManagerClient, type SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { type CopyContainer, secretCopyContainers } from '../lib/scaleway/secret-copies';
import { runIfMain } from '../lib/utils/is-main';
import { getFlag } from './args';

/** The Secret Manager calls the task needs, so a test passes its own. */
export interface EnsureSecretsClient {
  getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined>;
  accessLatestValue(secretId: string): Promise<string>;
  putSecretValue(input: { secretId: string; value: string; description?: string; disablePrevious?: boolean }): Promise<unknown>;
}

/** A fresh generated value: 32 URL-safe characters from 192 random bits. */
export function generateSecretValue(): string {
  return randomBytes(24).toString('base64url');
}

const hasValue = (copy: CopyContainer) => (copy.container?.version_count ?? 0) > 0;

/**
 * Make the value of every generated or derived runtime secret straight into Secret Manager, so it never passes through the Pulumi state. A value
 * that exists in any copy is the value: copies without one get it, and nothing is regenerated (rotating is its own action). A secret none of
 * whose copies has a value gets a fresh one, or the one derived from its source. A copy whose container the `up` has not made yet is left for
 * the next run. Returns the secrets that got a value.
 */
export async function ensureSecrets(opts: {
  client: EnsureSecretsClient;
  slug: string;
  mode: string;
  secrets?: readonly RuntimeSecretDefinition[];
  generate?: () => string;
  log?: (message: string) => void;
}): Promise<string[]> {
  const log = opts.log ?? ((message) => console.info(message));
  const generate = opts.generate ?? generateSecretValue;
  const all = opts.secrets ?? runtimeSecrets;
  const values = new Map<string, string>();
  const written: string[] = [];

  const resolveValue = async (definition: RuntimeSecretDefinition): Promise<string | undefined> => {
    const known = values.get(definition.id);
    if (known !== undefined) return known;
    const copies = await secretCopyContainers(opts.client, definition, opts.slug, opts.mode);
    const existing = copies.find(hasValue);
    let value: string | undefined;
    if (existing?.container) {
      value = await opts.client.accessLatestValue(existing.container.id);
    } else if (definition.derivedFrom) {
      const { secretId, derive } = definition.derivedFrom;
      const source = all.find((candidate) => candidate.id === secretId);
      if (!source) throw new Error(`ensure-secrets: '${definition.id}' derives from unknown secret '${secretId}'`);
      const sourceValue = await resolveValue(source);
      value = sourceValue === undefined ? undefined : derive(sourceValue);
    } else {
      value = generate();
    }
    if (value === undefined) return undefined;
    const empty = copies.filter((copy) => copy.container && !hasValue(copy));
    for (const copy of empty) {
      await opts.client.putSecretValue({ secretId: copy.container!.id, value, description: 'Made by ensure-secrets', disablePrevious: false });
    }
    const missing = copies.filter((copy) => !copy.container);
    if (missing.length > 0) log(`[ensure-secrets] ${definition.secretName}: no container yet for ${missing.map((copy) => copy.service).join(', ')}`);
    if (empty.length > 0) {
      log(
        `[ensure-secrets] ${definition.secretName}: ${empty.length} cop${empty.length === 1 ? 'y' : 'ies'} given ${existing ? 'its value' : 'a new value'}`,
      );
      written.push(definition.secretName);
    }
    values.set(definition.id, value);
    return value;
  };

  for (const definition of generatedRuntimeSecrets(all)) await resolveValue(definition);
  return written;
}

/** The deploy's step: the key in `SCW_SECRET_KEY`, the project and region from flags, the slug from the mode's engine config. */
export async function main(argv = process.argv.slice(2)): Promise<void> {
  const secretKey = process.env.SCW_SECRET_KEY;
  const region = getFlag(argv, '--region');
  const projectId = getFlag(argv, '--project-id');
  const mode = getFlag(argv, '--mode');
  if (!secretKey || !region || !projectId || !mode) throw new Error('Required: SCW_SECRET_KEY, --region, --project-id, --mode');
  process.env.APP_MODE = mode;
  const { loadEngineConfig } = await import('../config/engine-config');
  const { slug } = await loadEngineConfig();
  await ensureSecrets({ client: createSecretManagerClient({ secretKey, region, projectId }), slug, mode });
}

runIfMain(import.meta.url, main);
