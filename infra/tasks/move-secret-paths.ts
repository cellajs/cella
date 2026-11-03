import { REPOSITORY_KEY_NAME } from '../lib/deploy/repository-key';
import type { RuntimeSecretDefinition } from '../lib/runtime-secrets';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';
import { ENGINE_FOLDER, RUNTIME_FOLDER } from '../lib/scaleway/secret-paths';

/** The Secret Manager calls the move makes, so a test passes its own. */
export interface MoveSecretsClient {
  listSecrets(): Promise<SecretManagerSecret[]>;
  accessLatestValue(secretId: string): Promise<string>;
  putSecretValue(input: { secretId: string; value: string; description?: string; disablePrevious?: boolean }): Promise<unknown>;
  moveSecret(secretId: string, path: string): Promise<unknown>;
  deleteSecret(secretId: string): Promise<void>;
}

/** The folder a secret sits in, in one form: `/backend/` and `/backend` are the same folder. */
const folderOf = (secret: Pick<SecretManagerSecret, 'path'>) => `/${secret.path.split('/').filter(Boolean).join('/')}/`.replace(/^\/\/$/, '/');

/** The folder the deploy read its values from before the runtime folder, its standing machine keys among them. */
const RETIRED_DEPLOY_FOLDER = '/deploy/';

/** One secret's move: the container that moves to the runtime folder, the value it is given first, and the containers deleted. */
export interface SecretMove {
  name: string;
  keep: SecretManagerSecret;
  /** A container whose value the kept one takes, when the kept one has none. */
  fillFrom?: SecretManagerSecret;
  remove: SecretManagerSecret[];
}

const hasValue = (secret: SecretManagerSecret) => (secret.version_count ?? 0) > 0;

/**
 * Where one secret's containers go: the one in the runtime folder stays when there is one, else the copy of the first consumer, which the
 * program's alias names (resources/secrets.ts), else the first found. The kept container takes a value from another when it has none, and
 * every other container goes. Undefined when the runtime folder holds the only one.
 */
export function secretMove(name: string, containers: readonly SecretManagerSecret[], firstConsumer?: string): SecretMove | undefined {
  const inRuntime = containers.find((secret) => folderOf(secret) === RUNTIME_FOLDER);
  const keep = inRuntime ?? containers.find((secret) => folderOf(secret) === `/${firstConsumer}/`) ?? containers[0];
  if (!keep) return undefined;
  const remove = containers.filter((secret) => secret !== keep);
  if (inRuntime && remove.length === 0) return undefined;
  const fillFrom = hasValue(keep) ? undefined : remove.find(hasValue);
  return { name, keep, ...(fillFrom ? { fillFrom } : {}), remove };
}

/**
 * The one-time move to one container per value: each runtime secret's copies (one per consumer folder, or a shared folder left from before
 * them) and the repository read key leave for the runtime folder, the value kept, and the deploy folder's machine keys and telemetry copy
 * go. A secret's id and versions stay with the container that moves, so the program adopts it. The engine folder is left alone. Idempotent:
 * once the runtime folder holds the only container of each name, nothing is left to move. Returns the names moved.
 */
export async function moveSecretPaths(opts: {
  client: MoveSecretsClient;
  secrets: readonly Pick<RuntimeSecretDefinition, 'secretName' | 'services'>[];
  log?: (message: string) => void;
}): Promise<string[]> {
  const log = opts.log ?? ((message) => console.info(message));
  const listed = (await opts.client.listSecrets()).filter((secret) => folderOf(secret) !== ENGINE_FOLDER);
  const named = (name: string) => listed.filter((secret) => secret.name === name);
  const moves = [
    ...opts.secrets.map((definition) => secretMove(definition.secretName, named(definition.secretName), definition.services[0])),
    secretMove(REPOSITORY_KEY_NAME, named(REPOSITORY_KEY_NAME)),
  ].filter((move): move is SecretMove => move !== undefined);
  for (const move of moves) {
    if (move.fillFrom) {
      const value = await opts.client.accessLatestValue(move.fillFrom.id);
      await opts.client.putSecretValue({
        secretId: move.keep.id,
        value,
        description: `Moved from ${folderOf(move.fillFrom)}`,
        disablePrevious: false,
      });
    }
    if (folderOf(move.keep) !== RUNTIME_FOLDER) await opts.client.moveSecret(move.keep.id, RUNTIME_FOLDER);
    for (const secret of move.remove) await opts.client.deleteSecret(secret.id);
    log(
      `[move-secret-paths] ${move.name}: ${folderOf(move.keep)} → ${RUNTIME_FOLDER}${move.remove.length > 0 ? `, ${move.remove.length} other(s) deleted` : ''}`,
    );
  }
  for (const secret of listed.filter((candidate) => folderOf(candidate) === RETIRED_DEPLOY_FOLDER && candidate.name.startsWith('machine-key-'))) {
    await opts.client.deleteSecret(secret.id);
    log(`[move-secret-paths] ${RETIRED_DEPLOY_FOLDER}${secret.name}: deleted, its application is retired`);
  }
  return moves.map((move) => move.name);
}
