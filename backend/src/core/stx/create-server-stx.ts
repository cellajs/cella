import { uuidv7 } from 'uuidv7';
import type { StxBase } from '#/schemas/sync-transaction-schemas';
import { isArrayDelta } from './array-delta';
import { generateServerHLC } from './hlc';

/** Trusted server mutation metadata. Creates use it directly; `resolveServerUpdateOps` adds field timestamps. */
export function createServerStx(): StxBase {
  return {
    mutationId: uuidv7(),
    sourceId: 'server',
    fieldTimestamps: {},
  };
}

/**
 * A server transaction that already stamps the scalar fields of `ops`, so a body built on the server passes the
 * update schema's timestamp check (a tool call, for instance) before the operation assigns its own HLC.
 */
export function createServerStxStamping(ops: Record<string, unknown>): StxBase {
  const stx = createServerStx();
  const scalarFields = Object.keys(ops).filter((field) => !isArrayDelta(ops[field]));
  if (scalarFields.length === 0) return stx;
  const timestamp = generateServerHLC(stx.sourceId);
  return { ...stx, fieldTimestamps: Object.fromEntries(scalarFields.map((field) => [field, timestamp])) };
}
