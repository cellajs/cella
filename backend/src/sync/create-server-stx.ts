import type { StxBase } from '#/schemas/stx-base-schema';
import { nanoid } from '#/utils/nanoid';

/**
 * Create sync transaction metadata for server-side entity creation.
 * Use this for system-generated entities (seeds, imports, background jobs)
 * that bypass the normal client mutation flow.
 */
export function createServerStx(): StxBase {
  return {
    id: nanoid(),
    sourceId: 'server',
    version: 1,
    fieldVersions: {},
  };
}
