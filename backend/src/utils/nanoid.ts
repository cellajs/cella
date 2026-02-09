import { customAlphabet } from 'nanoid';

/**
 * Generate a random (lowercase, alphanumerical) string. Default length is 24.
 */
export const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24);

/** Reserved tenant ID for public/platform-wide content */
const RESERVED_TENANT_ID = 'public';

/**
 * Generate a 24-character lowercase alphanumeric ID for tenant IDs.
 * Includes collision check against reserved 'public' tenant ID.
 */
export function nanoidTenant(): string {
  let id = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24)();
  // Extremely unlikely but prevent reserved ID collision
  while (id === RESERVED_TENANT_ID) {
    id = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 24)();
  }
  return id;
}
