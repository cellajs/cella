import { uuidv7 } from 'uuidv7';
import type { StxBase } from '#/schemas/sync-transaction-schemas';

/** Trusted server mutation metadata. Creates use it directly; `resolveServerUpdateOps` adds field timestamps. */
export function createServerStx(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId: 'server',
    fieldTimestamps: {},
  };
}
