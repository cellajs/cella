import type { TxBase } from '#/schemas/tx-base-schema';
import { nanoid } from '#/utils/nanoid';

/**
 * Create transaction metadata for server-side entity creation.
 * Use this for system-generated entities (seeds, imports, background jobs)
 * that bypass the normal client mutation flow.
 */
export function createServerTx(): TxBase {
  return {
    id: nanoid(),
    sourceId: 'server',
    version: 1,
    fieldVersions: {},
  };
}
