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

/** Which tenant a request transaction runs as, and whether it reaches soft-deleted rows. */
type RequestTransactionOptions = {
  /** The tenant a route without `tenantGuard` resolved itself, such as an org-scoped list on bare `baseDb`. Default: `ctx.var.tenantId`. */
  tenantId?: string;
  /** Sets `app.include_deleted`: reads see tombstones, and an UPDATE's WHERE reaches them, since the select policy filters it too. */
  includeDeleted?: boolean;
};

/**
 * Read-only tenant RLS transaction for a request's product reads. A write reads the rows it changes (`forUpdate`
 * included) in a savepoint of its own tenant transaction.
 */
export const tenantRead = <T>(
  ctx: ActorContext,
  fn: (readCtx: ActorContext) => Promise<T>,
  { tenantId = ctx.var.tenantId, includeDeleted = false }: RequestTransactionOptions = {},
): Promise<T> => requestTransaction(ctx, tenantId, includeDeleted, true, fn);

/** Read-write tenant RLS transaction for a request's writes; the session variables let RLS select policies pass on RETURNING. */
export const tenantContext = <T>(
  ctx: ActorContext,
  fn: (txCtx: ActorContext) => Promise<T>,
  { tenantId = ctx.var.tenantId, includeDeleted = false }: RequestTransactionOptions = {},
): Promise<T> => requestTransaction(ctx, tenantId, includeDeleted, false, fn);
