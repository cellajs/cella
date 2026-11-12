import { sql } from 'drizzle-orm';
import type { ActorContext } from '#/core/context';
import { transactionOpenedWith } from '#/db/create-connection';
import { baseDb, type DbOrTx, type Tx } from '#/db/db';
import { type TenantSessionVars, tenantTransactionOpening } from '#/db/tenant-transaction-opening';

/** What each live tenant transaction runs as, so a nested request for the same tenant joins it on its connection. */
const openTransactions = new WeakMap<DbOrTx, TenantSessionVars & { readOnly: boolean }>();

/**
 * A transaction on the runtime pool that starts with the session variables the RLS policies read.
 * @throws A tenant id outside the id alphabet, before a connection is taken.
 */
const tenantTransaction = async <T>(vars: TenantSessionVars, readOnly: boolean, fn: (tx: Tx) => Promise<T>): Promise<T> =>
  transactionOpenedWith(baseDb, tenantTransactionOpening(vars, readOnly), (tx) => {
    openTransactions.set(tx, { ...vars, readOnly });
    return fn(tx);
  });

/** `set_config` is transaction-local; inside a savepoint it reverts on rollback but survives release. */
const setIncludeDeleted = (tx: DbOrTx, value: boolean) => tx.execute(sql`SELECT set_config('app.include_deleted', ${String(value)}, true)`);

/**
 * A tenant transaction for a request: `fn` gets a clone of the context whose `db` is the transaction. A context already
 * inside a tenant transaction for the same tenant joins it as a savepoint, so `fn` sees the open transaction's
 * uncommitted rows and a throw above it still rolls everything back; this is what lets a module hook, such as
 * `onDemoCreated`, call an operation that opens its own transaction.
 * @throws When the open transaction belongs to another tenant, or is read only while the request is not.
 */
const requestTransaction = async <T>(
  ctx: ActorContext,
  tenantId: string,
  includeDeleted: boolean,
  readOnly: boolean,
  fn: (txCtx: ActorContext) => Promise<T>,
): Promise<T> => {
  const open = openTransactions.get(ctx.var.db);
  if (!open) return tenantTransaction({ tenantId, includeDeleted }, readOnly, (tx) => fn({ var: { ...ctx.var, db: tx } }));

  if (open.tenantId !== tenantId) throw new Error('Tenant transaction refused: the open transaction belongs to another tenant');
  if (open.readOnly && !readOnly) throw new Error('Tenant transaction refused: the open transaction is read only');

  return ctx.var.db.transaction(async (tx) => {
    openTransactions.set(tx, { ...open, includeDeleted });
    if (open.includeDeleted !== includeDeleted) await setIncludeDeleted(tx, includeDeleted);
    const result = await fn({ var: { ...ctx.var, db: tx } });
    // A rolled-back savepoint reverts the setting itself; a released one keeps it, so the outer value goes back by hand.
    if (open.includeDeleted !== includeDeleted) await setIncludeDeleted(tx, open.includeDeleted);
    return result;
  });
};

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

/** `tenantContext` that also reaches soft-deleted rows (`app.include_deleted`): the select policy filters an UPDATE's WHERE too. */
export const tenantContextIncludingDeleted = <T>(ctx: ActorContext, fn: (txCtx: ActorContext) => Promise<T>): Promise<T> =>
  requestTransaction(ctx, ctx.var.tenantId, true, false, fn);

/** Whether the context's connection is a read-write tenant transaction: a write made on it commits or rolls back with the caller's own. */
export const inWriteTransaction = (ctx: ActorContext): boolean => openTransactions.get(ctx.var.db)?.readOnly === false;
