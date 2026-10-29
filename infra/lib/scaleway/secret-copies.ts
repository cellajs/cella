import type { SecretManagerSecret, SecretManagerSecretVersion } from './scaleway-secret-manager';
import { type SecretCopy, secretCopies } from './secret-paths';

/** The Secret Manager calls the copies need, so a test passes its own. */
export interface SecretCopyClient {
  getSecretByName(name: string, path: string): Promise<SecretManagerSecret | undefined>;
  putSecretValue(input: { secretId: string; value: string; description?: string; disablePrevious?: boolean }): Promise<SecretManagerSecretVersion>;
}

/** One copy of a runtime secret with its container, when the container exists. */
export type CopyContainer = SecretCopy & { container?: SecretManagerSecret };

/** The copies of a runtime secret, one per consumer, each with its container when it exists. */
export function secretCopyContainers(
  client: Pick<SecretCopyClient, 'getSecretByName'>,
  definition: { secretName: string; services: readonly string[] },
): Promise<CopyContainer[]> {
  return Promise.all(
    secretCopies(definition).map(async (copy) => ({
      ...copy,
      container: await client.getSecretByName(definition.secretName, copy.path),
    })),
  );
}

/** The copies whose container does not exist yet, as `<service> (<path>)`. */
export function missingCopies(copies: readonly CopyContainer[]): string[] {
  return copies.filter((copy) => !copy.container).map((copy) => `${copy.service} (${copy.path})`);
}

/** The containers of the copies that exist. */
export function existingContainers(copies: readonly CopyContainer[]): SecretManagerSecret[] {
  return copies.flatMap((copy) => (copy.container ? [copy.container] : []));
}

/** Write one value into every copy, so every consumer reads the same; the revision of each copy, in order. */
export async function putEveryCopy(
  client: Pick<SecretCopyClient, 'putSecretValue'>,
  containers: readonly SecretManagerSecret[],
  value: string,
  opts: { description: string; disablePrevious: boolean },
): Promise<number[]> {
  const revisions: number[] = [];
  for (const container of containers) {
    const version = await client.putSecretValue({ secretId: container.id, value, ...opts });
    revisions.push(version.revision);
  }
  return revisions;
}
