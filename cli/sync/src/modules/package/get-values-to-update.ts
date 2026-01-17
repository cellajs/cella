import semver from 'semver';

/**
 * Checks if a version string is locked (exact version without ^ or ~).
 */
function isLockedVersion(version: string): boolean {
  return !/[\^~]/.test(version);
}

/**
 * Get updates for a dependency-like object (key-value pairs with semver versions).
 * Only updates keys that exist in fork, respects locked versions.
 */
export function getDepsToUpdate(
  upstreamDeps: Record<string, string>,
  forkDeps: Record<string, string>,
): Record<string, string> {
  const updates: Record<string, string> = {};

  for (const dep in upstreamDeps) {
    const upstreamVersion = upstreamDeps[dep];
    const forkVersion = forkDeps[dep];

    // Only update if key exists in fork
    if (!forkVersion) continue;

    // Skip if fork version is locked (exact)
    if (isLockedVersion(forkVersion)) continue;

    // Skip if fork version is >= upstream version
    const upstreamCoerced = semver.coerce(upstreamVersion);
    const forkCoerced = semver.coerce(forkVersion);
    if (upstreamCoerced && forkCoerced && semver.lte(upstreamCoerced, forkCoerced)) {
      continue;
    }

    updates[dep] = upstreamVersion;
  }

  return updates;
}

/**
 * Get updates for a generic object (key-value pairs, non-semver).
 * Only updates keys that exist in fork.
 */
export function getObjectToUpdate<T>(
  upstreamObj: Record<string, T>,
  forkObj: Record<string, T>,
): Record<string, T> {
  const updates: Record<string, T> = {};

  for (const key in upstreamObj) {
    // Only update if key exists in fork
    if (!(key in forkObj)) continue;

    const upstreamValue = upstreamObj[key];
    const forkValue = forkObj[key];

    // Only update if values differ
    if (JSON.stringify(upstreamValue) !== JSON.stringify(forkValue)) {
      updates[key] = upstreamValue;
    }
  }

  return updates;
}

/**
 * Get update for an array value.
 * Returns upstream array if fork has the key and arrays differ.
 */
export function getArrayToUpdate<T>(upstreamArr: T[], forkArr: T[]): T[] | null {
  if (JSON.stringify(upstreamArr) !== JSON.stringify(forkArr)) {
    return upstreamArr;
  }
  return null;
}

/**
 * Get update for a primitive value.
 * Returns upstream value if fork has the key and values differ.
 */
export function getPrimitiveToUpdate<T>(upstreamVal: T, forkVal: T): T | null {
  if (upstreamVal !== forkVal) {
    return upstreamVal;
  }
  return null;
}

/** Type of package.json root key for sync purposes */
export type PackageKeyType = 'dependencies' | 'object' | 'array' | 'primitive';

/**
 * Detect the type of a package.json root key based on its value.
 */
export function detectKeyType(value: unknown, key: string): PackageKeyType {
  // Known dependency keys use semver logic
  if (key === 'dependencies' || key === 'devDependencies' || key === 'peerDependencies' || key === 'optionalDependencies') {
    return 'dependencies';
  }

  if (Array.isArray(value)) return 'array';
  if (typeof value === 'object' && value !== null) return 'object';
  return 'primitive';
}

/**
 * Summary of updates for a single package.json key.
 */
export interface KeyUpdateSummary {
  key: string;
  type: PackageKeyType;
  updateCount: number;
  updates: Record<string, unknown> | unknown[] | unknown | null;
}

/**
 * Get all updates for configured package.json keys.
 */
export function getPackageUpdates(
  upstreamPkg: Record<string, unknown>,
  forkPkg: Record<string, unknown>,
  keysToSync: string[],
): KeyUpdateSummary[] {
  const summaries: KeyUpdateSummary[] = [];

  for (const key of keysToSync) {
    const upstreamValue = upstreamPkg[key];
    const forkValue = forkPkg[key];

    // Skip if fork doesn't have this key or upstream doesn't have it
    if (forkValue === undefined || upstreamValue === undefined) continue;

    const keyType = detectKeyType(upstreamValue, key);
    let updates: Record<string, unknown> | unknown[] | unknown | null = null;
    let updateCount = 0;

    switch (keyType) {
      case 'dependencies': {
        const depsUpdates = getDepsToUpdate(
          upstreamValue as Record<string, string>,
          forkValue as Record<string, string>,
        );
        updates = depsUpdates;
        updateCount = Object.keys(depsUpdates).length;
        break;
      }

      case 'object': {
        const objUpdates = getObjectToUpdate(
          upstreamValue as Record<string, unknown>,
          forkValue as Record<string, unknown>,
        );
        updates = objUpdates;
        updateCount = Object.keys(objUpdates).length;
        break;
      }

      case 'array':
        updates = getArrayToUpdate(upstreamValue as unknown[], forkValue as unknown[]);
        updateCount = updates ? 1 : 0;
        break;

      case 'primitive':
        updates = getPrimitiveToUpdate(upstreamValue, forkValue);
        updateCount = updates !== null ? 1 : 0;
        break;
    }

    if (updateCount > 0) {
      summaries.push({ key, type: keyType, updateCount, updates });
    }
  }

  return summaries;
}

/**
 * Apply updates to a package.json object (mutates in place).
 */
export function applyPackageUpdates(
  pkg: Record<string, unknown>,
  updates: KeyUpdateSummary[],
): void {
  for (const { key, type, updates: keyUpdates } of updates) {
    if (!keyUpdates) continue;

    switch (type) {
      case 'dependencies':
      case 'object':
        // Merge object updates
        pkg[key] = { ...(pkg[key] as Record<string, unknown>), ...(keyUpdates as Record<string, unknown>) };
        break;

      case 'array':
        // Replace array entirely
        pkg[key] = keyUpdates;
        break;

      case 'primitive':
        // Replace primitive value
        pkg[key] = keyUpdates;
        break;
    }
  }
}
