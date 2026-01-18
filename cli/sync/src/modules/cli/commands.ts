import { InvalidArgumentError } from 'commander';

import { SUPPORTED_SYNC_SERVICES } from '#/config/sync-services';

/**
 * Validate a Git branch name.
 *
 * @param name - Name of the branch to validate
 *
 * @throws {InvalidArgumentError} If the branch name is invalid.
 * @returns The validated branch name.
 */
export function validateBranchName(name: string): string {
  name = name.trim();
  if (isValidBranchName(name) === false) {
    throw new InvalidArgumentError(`Invalid branch name: ${name}.`);
  }
  return name;
}

/**
 * Validate a sync service name.
 *
 * @param name - Name of the sync service to validate
 *
 * @throws {InvalidArgumentError} If the sync service name is invalid.
 * @returns The validated sync service name.
 */
export function validateSyncService(name: string): string {
  name = name.trim();
  if (SUPPORTED_SYNC_SERVICES.includes(name as any) === false) {
    throw new InvalidArgumentError(
      `Invalid sync service: ${name}. Supported services are ${SUPPORTED_SYNC_SERVICES.map((service: any) => `"${service}"`).join(', ')}.`,
    );
  }
  return name;
}

/**
 * Check if a branch name is valid according to Git naming conventions.
 *
 * @param name - Name of the branch to check
 *
 * @returns boolean indicating if the branch name is valid
 */
function isValidBranchName(name: string): boolean {
  if (!name) return false;

  // Cannot start or end with slash
  if (name.startsWith('/') || name.endsWith('/')) return false;

  // Cannot contain consecutive slashes
  if (name.includes('//')) return false;

  // Cannot contain whitespace or control characters
  if (/[ \t\n\r]/.test(name)) return false;

  // Cannot end with a dot
  if (name.endsWith('.')) return false;

  // Cannot contain these forbidden characters
  //   space, tilde, ^, :, ?, *, [, \
  if (/[~^:?*\[\\]/.test(name)) return false;

  // Cannot contain @{ sequence
  if (name.includes('@{')) return false;

  // Cannot contain ASCII control chars
  for (const c of name) {
    if (c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127) return false;
  }

  return true;
}
