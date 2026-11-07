import type { ActorContext } from '#/core/context';
import { transactionOpenedWith } from '#/db/create-connection';
import { baseDb, type DbOrTx, type Tx } from '#/db/db';
import { type TenantSessionVars, tenantTransactionOpening } from '#/db/tenant-transaction-opening';

/**
 * A transaction on the runtime pool that starts with the session variables the RLS policies read.
 * @throws A tenant id outside the id alphabet, before a connection is taken.
 */
const tenantTransaction = async <T>(vars: TenantSessionVars, readOnly: boolean, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  transactionOpenedWith(baseDb, tenantTransactionOpening(vars, readOnly), fn);

/** A tenant transaction for a request: `fn` gets a clone of the context whose `db` is the transaction. */
const requestTransaction = <T>(
  ctx: ActorContext,
  tenantId: string,
  includeDeleted: boolean,
  readOnly: boolean,
  fn: (txCtx: ActorContext) => Promise<T>,
) => tenantTransaction({ tenantId, includeDeleted }, readOnly, (tx) => fn({ var: { ...ctx.var, db: tx } }));

/**
 * Read-only RLS transaction for code with no request behind it, such as a CDC listener or a
 * scheduled job. Opens with `tenantTransactionOpening` like every tenant transaction, so a policy
 * that starts reading a new `app.*` variable needs no change in background callers. Product read
 * policies are tenant-scoped, so any per-user rule must be applied explicitly by the caller.
 */
export const tenantReadById = <T>(tenantId: string, fn: (tx: DbOrTx) => Promise<T>): Promise<T> =>
  tenantTransaction({ tenantId, includeDeleted: false }, true, fn);

/** Read-write RLS transaction for a scheduled job that works one tenant's rows, as {@link tenantReadById} reads them. */
export const tenantContextById = <T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  tenantTransaction({ tenantId, includeDeleted: false }, false, fn);

/**
 * `tenantRead` with an explicit tenant id, for cross-tenant routes (bare `baseDb`, no
 * `ctx.var.tenantId`) that resolved the request's single tenant themselves, e.g. an org-scoped
 * list whose per-row subqueries read RLS-guarded product tables.
 */
export const tenantReadAs = <T>(ctx: ActorContext, tenantId: string, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> =>
  requestTransaction(ctx, tenantId, false, true, fn);

/** `tenantReadAs` that also reads soft-deleted rows (`app.include_deleted`), for a delta read on a route without `tenantGuard`. */
export const tenantReadAsIncludingDeleted = <T>(ctx: ActorContext, tenantId: string, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> =>
  requestTransaction(ctx, tenantId, true, true, fn);

/** Read-only tenant RLS transaction for normal product queries. */
export const tenantRead = <T>(ctx: ActorContext, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> =>
  requestTransaction(ctx, ctx.var.tenantId, false, true, fn);

/**
 * `tenantRead` for a caller on the bare pool, which carries no RLS session context. A caller that already holds a
 * tenant transaction (a write that reads the rows it changes, with `forUpdate`) reads in it.
 */
export const tenantReadUnlessInTransaction = <T>(ctx: ActorContext, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> =>
  ctx.var.db === baseDb ? tenantRead(ctx, fn) : fn(ctx);

/** `tenantRead` that also reads soft-deleted rows (`app.include_deleted`). */
export const tenantReadIncludingDeleted = <T>(ctx: ActorContext, fn: (readCtx: ActorContext) => Promise<T>): Promise<T> =>
  requestTransaction(ctx, ctx.var.tenantId, true, true, fn);

/** Read-write RLS transaction for mutation handlers; session vars let RLS SELECT policies pass on RETURNING. */
export const tenantContext = <T>(ctx: ActorContext, fn: (txCtx: ActorContext) => Promise<T>): Promise<T> =>
  requestTransaction(ctx, ctx.var.tenantId, false, false, fn);

/** `tenantContext` that also reads soft-deleted rows (`app.include_deleted`). */
export const tenantContextIncludingDeleted = <T>(ctx: ActorContext, fn: (txCtx: ActorContext) => Promise<T>): Promise<T> =>
  requestTransaction(ctx, ctx.var.tenantId, true, false, fn);
