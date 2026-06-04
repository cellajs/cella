import { customAlphabet } from 'nanoid';

/** Lowercase alphanumeric alphabet used for all ID generation. */
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Generate a random (lowercase, alphanumerical) string. Default length is 24.
 */
export const nanoid = customAlphabet(alphabet, 24);

/** Reserved tenant ID for public/platform-wide content */
const RESERVED_TENANT_ID = 'public';

/**
 * Generate a tenant ID: 6-character lowercase alphanumeric string.
 * Shorter than the default nanoid for brevity in URLs and ease of use.
 * Checks against reserved ID to prevent collision (extremely unlikely).
 */
export function nanoidTenant(): string {
  const generate = customAlphabet(alphabet, 6);
  let id = generate();
  // Extremely unlikely but prevent reserved ID collision
  while (id === RESERVED_TENANT_ID) {
    id = generate();
  }
  return id;
}
