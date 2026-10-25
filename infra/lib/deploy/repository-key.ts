import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deployFolderPath } from '../scaleway/secret-paths';
import { infraDir } from '../utils/paths';

/** The repository read key's name in the deploy folder: a read-only key a private repository is fetched with (D19). */
export const REPOSITORY_KEY_NAME = 'repository-read-key';

/** The repository the root `package.json` names, as git reads it: the one a release's commit is fetched from. */
export function repositoryUrl(root = join(infraDir, '..')): string {
  const { repository } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { repository?: string };
  if (!repository?.startsWith('https://'))
    throw new Error("set the root package.json's 'repository' to the https URL a release's commit is fetched from");
  return `${repository.replace(/\.git$/, '')}.git`;
}

/** The Secret Manager calls the lookup makes. */
interface KeySecrets {
  getSecretByName(name: string, path: string): Promise<{ id: string; version_count?: number } | undefined>;
  accessLatestValue(secretId: string): Promise<string>;
}

/** The deploy folder's repository read key, or undefined for a repository anyone may read. */
export async function readRepositoryKey(secrets: KeySecrets, slug: string, mode: string): Promise<string | undefined> {
  const container = await secrets.getSecretByName(REPOSITORY_KEY_NAME, deployFolderPath(slug, mode));
  if (!container || (container.version_count ?? 0) === 0) return undefined;
  return (await secrets.accessLatestValue(container.id)).trim() || undefined;
}
