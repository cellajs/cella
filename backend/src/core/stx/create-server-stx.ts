import { uuidv7 } from 'uuidv7';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Create sync transaction metadata for server-side entity creation.
 * Use this for system-generated entities (seeds, imports, background jobs)
 * that bypass the normal client mutation flow.
 */
export function createServerStx(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId: 'server',
    fieldTimestamps: {},
  };
}
