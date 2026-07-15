import { uuidv7 } from 'uuidv7';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/**
 * Create base metadata for a trusted server mutation. Creates use it directly;
 * `resolveServerUpdateOps` adds timestamps for changed scalar fields.
 */
export function createServerStx(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId: 'server',
    fieldTimestamps: {},
  };
}
