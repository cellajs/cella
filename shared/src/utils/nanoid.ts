import { customAlphabet } from 'nanoid';

/** The 36 lowercase letters and digits of every nanoid id. */
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 24 characters by default. */
export const nanoid = customAlphabet(alphabet, 24);

/** Reserved for public, platform-wide content. */
const reservedTenantId = 'public';

const tenantIdCandidate = customAlphabet(alphabet, 6);

/** 6 characters, short enough to read in a URL, and never the reserved id. */
export function nanoidTenant(): string {
  let id = tenantIdCandidate();
  while (id === reservedTenantId) {
    id = tenantIdCandidate();
  }
  return id;
}
