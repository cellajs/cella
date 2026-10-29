import { actionCommand } from '../lib/operator-actions';
import type { SecretManagerSecret } from '../lib/scaleway/scaleway-secret-manager';

/** The Secret Manager calls the move makes, so a test passes its own. */
export interface MoveSecretsClient {
  listSecrets(): Promise<SecretManagerSecret[]>;
  moveSecret(secretId: string, path: string): Promise<unknown>;
}

const trimmed = (path: string) => path.replace(/\/+$/, '');

/** A secret's place as `<folder>/<name>`, whatever trailing slash its folder carries. */
const placeOf = (name: string, path: string) => `${trimmed(path)}/${name}`;

/**
 * The folder a secret of an environment moves to: the folder it had under the `/<slug>-<mode>` prefix, from the project's root
 * (`/cella-production/backend` → `/backend/`, `/cella-production` → `/`). Undefined for a folder outside the prefix, which stays.
 */
export function unprefixedPath(path: string, slug: string, mode: string): string | undefined {
  const prefix = `/${slug}-${mode}`;
  const folder = trimmed(path);
  if (folder !== prefix && !folder.startsWith(`${prefix}/`)) return undefined;
  return `${folder.slice(prefix.length)}/`;
}

/**
 * Move every secret of an environment out of its `/<slug>-<mode>/` prefix, in place: the id and the versions stay, so the main job's secret
 * references, the hand-over bundle ids in cloud-init and the runtime-secret manifest on each machine, which all name ids, keep reading them.
 * A secret whose new folder already holds one of the same name stays under the prefix and is reported. Idempotent: a moved secret is outside
 * the prefix. Returns the secrets left under it, as `<folder>/<name>`.
 */
export async function moveSecretPaths(opts: {
  client: MoveSecretsClient;
  slug: string;
  mode: string;
  log?: (message: string) => void;
}): Promise<string[]> {
  const log = opts.log ?? ((message) => console.info(message));
  const listed = await opts.client.listSecrets();
  const taken = new Set(listed.map((secret) => placeOf(secret.name, secret.path)));
  const left: string[] = [];
  for (const secret of listed) {
    const target = unprefixedPath(secret.path, opts.slug, opts.mode);
    if (target === undefined) continue;
    const from = placeOf(secret.name, secret.path);
    const to = placeOf(secret.name, target);
    if (taken.has(to)) {
      log(`[move-secret-paths] ${from} stays: ${to} exists already, delete the one that is stale`);
      left.push(from);
      continue;
    }
    await opts.client.moveSecret(secret.id, target);
    taken.add(to);
    log(`[move-secret-paths] ${from} → ${to}`);
  }
  return left;
}

/**
 * Refuse a step that reads the deploy or engine folder while the environment's secrets still sit under its prefix: it would find an empty
 * folder there and make anew what exists. The operator key moves them when it unlocks a session.
 * @throws when any secret is still under `/<slug>-<mode>/`
 */
export async function assertSecretsUnprefixed(client: Pick<MoveSecretsClient, 'listSecrets'>, slug: string, mode: string): Promise<void> {
  const prefixed = (await client.listSecrets()).filter((secret) => unprefixedPath(secret.path, slug, mode) !== undefined);
  if (prefixed.length === 0) return;
  throw new Error(
    `${prefixed.length} secret(s) of ${mode} are still under /${slug}-${mode}/: any action on the operator key moves them (\`${actionCommand('apply')}\`), then run this again`,
  );
}
