import { escapeLiteral } from 'pg';

// No `#/env` import and no pool: the Yjs relay opens its transactions on its own pool with this text.

/** The alphabet of tenant and actor ids: a value outside it never reaches the text that opens a tenant transaction. */
const idAlphabet = /^[a-z0-9-]*$/i;

/** The session variables the RLS policies read. */
export interface TenantSessionVars {
  tenantId: string;
  /** Empty for code with no request behind it. */
  userId: string;
  includeDeleted: boolean;
}

/**
 * The opening of a tenant transaction for `transactionOpenedWith`: BEGIN, then the session variables the RLS policies
 * read (tenant id, user id, include_deleted), set transaction-local, in one round trip. Every tenant transaction, the
 * API's and the Yjs relay's, opens with it, so a policy that starts reading a new `app.*` variable changes this alone.
 * @throws An id outside the id alphabet, before a connection is taken.
 */
export function tenantTransactionOpening({ tenantId, userId, includeDeleted }: TenantSessionVars, readOnly: boolean): string {
  if (!idAlphabet.test(tenantId) || !idAlphabet.test(userId)) throw new Error('Tenant transaction refused: an id outside the id alphabet');
  return (
    `BEGIN${readOnly ? ' READ ONLY' : ''}; ` +
    `SELECT set_config('app.tenant_id', ${escapeLiteral(tenantId)}, true), ` +
    `set_config('app.user_id', ${escapeLiteral(userId)}, true), ` +
    `set_config('app.include_deleted', '${includeDeleted}', true)`
  );
}
