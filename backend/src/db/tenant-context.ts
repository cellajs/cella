import { escapeLiteral } from 'pg';
import type { ActorContext } from '#/core/context';
import { transactionOpenedWith } from './create-connection';
import type { DbOrTx, Tx } from './db';
import { baseDb } from './db';

/** The alphabet of tenant and actor ids: a value outside it never reaches the text that opens a tenant transaction. */
const idAlphabet = /^[a-z0-9-]*$/i;

interface SessionVars {
  tenantId: string;
  /** Empty for code with no request behind it. */
  userId: string;
  includeDeleted: boolean;
}

/**
 * A transaction that starts with the session variables the RLS policies read (tenant id, user id, include_deleted),
 * set transaction-local in the round trip that opens it.
 * @throws An id outside the id alphabet, before a connection is taken.
 */
async function tenantTransaction<T>({ tenantId, userId, includeDeleted }: SessionVars, readOnly: boolean, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (!idAlphabet.test(tenantId) || !idAlphabet.test(userId)) throw new Error('Tenant transaction refused: an id outside the id alphabet');
  const opening =
    `BEGIN${readOnly ? ' READ ONLY' : ''}; ` +
    `SELECT set_config('app.tenant_id', ${escapeLiteral(tenantId)}, true), ` +
    `set_config('app.user_id', ${escapeLiteral(userId)}, true), ` +
    `set_config('app.include_deleted', '${includeDeleted}', true)`;
  return transactionOpenedWith(baseDb, opening, fn);
}

/** A tenant transaction for a request: `fn` gets a clone of the context whose `db` is the transaction. */
const requestTransaction = <T>(ctx: ActorContext, includeDeleted: boolean, readOnly: boolean, fn: (txCtx: ActorContext) => Promise<T>) =>
  tenantTransaction({ tenantId: ctx.var.tenantId, userId: ctx.var.actor.id, includeDeleted }, readOnly, (tx) => fn({ var: { ...ctx.var, db: tx } }));

/**
 * Read-only RLS transaction for code with no request behind it, such as a CDC listener or a
 * scheduled job. Keeps the RLS session-variable contract in this file, so a policy that starts
 * reading a new `app.*` variable needs no change in background callers.
 *
 * `app.user_id` is set empty: product read policies are tenant-scoped, and any per-user rule must
 * be applied explicitly by the caller.
 */
export async function tenantReadById<T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> {
  return tenantTransaction({ tenantId, userId: '', includeDeleted: false }, true, fn);
}

/**
 * Read-write RLS transaction for a scheduled job that works one tenant's deleted rows, with `app.user_id` empty as in
 * {@link tenantReadById}.
 */
export async function tenantContextIncludingDeletedById<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return tenantTransaction({ tenantId, userId: '', includeDeleted: true }, false, fn);
}

/**
 * `tenantRead` with an explicit tenant id, for cross-tenant routes (bare `baseDb`, no
 * `ctx.var.tenantId`) that resolved the request's single tenant themselves, e.g. an org-scoped
 * list whose per-row subqueries read RLS-guarded product tables.
 * @public
 */
export async function tenantReadAs<T>(ctx: ActorContext, tenantId: string, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> {
  return tenantTransaction({ tenantId, userId: ctx.var.actor.id, includeDeleted: false }, true, (tx) => fn({ var: { ...ctx.var, db: tx } }));
}

/** Read-only tenant RLS transaction for normal product queries. */
export async function tenantRead<T>(ctx: ActorContext, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> {
  return requestTransaction(ctx, false, true, fn);
}

export async function tenantReadIncludingDeleted<T>(ctx: ActorContext, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> {
  return requestTransaction(ctx, true, true, fn);
}

/** Read-write RLS transaction for mutation handlers; session vars let RLS SELECT policies pass on RETURNING. */
export async function tenantContext<T>(ctx: ActorContext, fn: (txCtx: ActorContext) => Promise<T>): Promise<T> {
  return requestTransaction(ctx, false, false, fn);
}

export async function tenantContextIncludingDeleted<T>(ctx: ActorContext, fn: (txCtx: ActorContext) => Promise<T>): Promise<T> {
  return requestTransaction(ctx, true, false, fn);
}
