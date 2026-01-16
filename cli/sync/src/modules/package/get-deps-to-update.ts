import semver from 'semver';

/**
 * Checks if a version string is locked (exact version without ^ or ~).
 * - If version is exact (e.g., "1.2.3") → locked
 * - If version has ^ or ~ (e.g., "^1.2.3" or "~1.2.3") → not locked
 * 
 * @param version - The version string to check.
 * @returns True if the version is locked, false otherwise.
 */
function isLocked(version: string) {
  return !/[\^~]/.test(version);
}

/**
 * Compares remote and local dependencies to determine which need updates.
 * @param remoteDeps - Record of dependencies from the remote (upstream) package.json
 * @param localDeps - Record of dependencies from the local (fork) package.json
 * 
 * @returns Record of dependencies that need to be updated in the local package.json
 */
export function getDepsToUpdate(
  remoteDeps: Record<string, string>,
  localDeps: Record<string, string>
) {
  const updates: Record<string, string> = {};

  for (const dep in remoteDeps) {
    const remoteVersion = remoteDeps[dep];
    const localVersion = localDeps[dep];

    // Skip if local version is locked
    if (localVersion && isLocked(localVersion)) {
      continue;
    }

    // Skip if local version is >= remote version
    if (localVersion && semver.valid(semver.coerce(localVersion)) && semver.valid(semver.coerce(remoteVersion))) {
      if (semver.lte(semver.coerce(remoteVersion)!, semver.coerce(localVersion)!)) {
        continue;
      }
    }

    updates[dep] = remoteVersion;
  }

  return updates;
}