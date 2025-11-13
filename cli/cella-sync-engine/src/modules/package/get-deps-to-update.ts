import semver from 'semver';

function isLocked(version: string) {
  // If version is exact (e.g., "1.2.3") → locked
  // If version has ^ or ~ → not locked
  return !/[\^~]/.test(version);
}

export function getDepsToUpdate(
  remoteDeps: Record<string, string>,
  localDeps: Record<string, string>
) {
  const updates: Record<string, string> = {};

  for (const dep in remoteDeps) {
    const remoteVersion = remoteDeps[dep];
    const localVersion = localDeps[dep];

    // Skip if local version is locked
    if (localVersion && isLocked(localVersion)) continue;

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