import { sql } from 'drizzle-orm';
import { nanoidTenant } from 'shared/utils/nanoid';
import { describe, expect, it } from 'vitest';
import type { ActorContext } from '#/core/context';
import type { DbOrTx } from '#/db/db';
import { tenantContext, tenantContextById, tenantRead, tenantReadById, tenantReadIncludingDeleted } from '#/db/tenant-context';

// requestTransaction reads only `var.db` and `var.tenantId`; the rest of a request context is absent (test mock).
const ctxWith = (db: DbOrTx, tenantId: string) => ({ var: { db, tenantId } }) as unknown as ActorContext;

/** The server process behind this context's connection: equal pids mean one connection, so one transaction. */
const backendPid = async (db: DbOrTx) => {
  const { rows } = await db.execute<{ pid: number }>(sql`SELECT pg_backend_pid() AS pid`);
  return rows[0].pid;
};

const includeDeletedSetting = async (db: DbOrTx) => {
  const { rows } = await db.execute<{ v: string }>(sql`SELECT current_setting('app.include_deleted') AS v`);
  return rows[0].v;
};

/**
 * A tenant helper called inside a tenant transaction must not begin a second connection: a nested operation there
 * cannot see the outer transaction's uncommitted rows and survives its rollback, which breaks every module hook
 * (`onDemoCreated`) that calls an operation opening its own transaction. Apps hang their hooks on this contract.
 */
describe('joining an open tenant transaction', () => {
  it('runs a same-tenant read or write on the open connection', async () => {
    const tenantId = nanoidTenant();
    await tenantContextById(tenantId, async (outerTx) => {
      const outerPid = await backendPid(outerTx);
      const ctx = ctxWith(outerTx, tenantId);
      await tenantContext(ctx, async (txCtx) => {
        expect(await backendPid(txCtx.var.db)).toBe(outerPid);
      });
      await tenantRead(ctx, async (readCtx) => {
        expect(await backendPid(readCtx.var.db)).toBe(outerPid);
      });
    });
  });

  it('refuses a request for another tenant, and a write inside a read-only transaction', async () => {
    const tenantId = nanoidTenant();
    await tenantContextById(tenantId, async (outerTx) => {
      const foreign = ctxWith(outerTx, nanoidTenant());
      await expect(tenantContext(foreign, async () => {})).rejects.toThrow('another tenant');
    });
    await tenantReadById(tenantId, async (outerTx) => {
      const ctx = ctxWith(outerTx, tenantId);
      await expect(tenantContext(ctx, async () => {})).rejects.toThrow('read only');
      // The refusals left the outer transaction usable.
      expect(await includeDeletedSetting(outerTx)).toBe('false');
    });
  });

  it('sets app.include_deleted for the savepoint alone, on return and on a throw', async () => {
    const tenantId = nanoidTenant();
    await tenantContextById(tenantId, async (outerTx) => {
      const ctx = ctxWith(outerTx, tenantId);
      expect(await includeDeletedSetting(outerTx)).toBe('false');

      await tenantReadIncludingDeleted(ctx, async (readCtx) => {
        expect(await includeDeletedSetting(readCtx.var.db)).toBe('true');
      });
      expect(await includeDeletedSetting(outerTx)).toBe('false');

      // The savepoint's rollback reverts the setting without the restore statement running.
      await expect(
        tenantReadIncludingDeleted(ctx, async () => {
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await includeDeletedSetting(outerTx)).toBe('false');
    });
  });
});
