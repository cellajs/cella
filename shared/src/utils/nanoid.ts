import { customAlphabet } from 'nanoid';

/** Used for all id generation. */
const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';

/** 24 characters by default. */
export const nanoid = customAlphabet(alphabet, 24);

/** Reserved for public, platform-wide content. */
const RESERVED_TENANT_ID = 'public';

/** 6 characters, short enough to read in a URL, and never the reserved id. */
export function nanoidTenant(): string {
  const generate = customAlphabet(alphabet, 6);
  let id = generate();
  while (id === RESERVED_TENANT_ID) {
    id = generate();
  }
  return id;
}
