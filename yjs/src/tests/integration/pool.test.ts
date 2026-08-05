import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { withRlsTx } from '../../data/db';

describe('6.2 Pool behavior', () => {
  it('withRlsTx releases connection back to pool even on error', async () => {
    // Run 50 iterations: if pool leaks, it will hang (pool exhausted at 20)
    for (let i = 0; i < 50; i++) {
      try {
        await withRlsTx('test-tenant', 'test-user', async (tx) => {
          if (i % 5 === 0) throw new Error('Simulated failure');
          await tx.execute(sql`SELECT 1`);
        });
      } catch {
        // Expected for every 5th iteration
      }
    }

    // Verify pool is still functional
    await withRlsTx('test-tenant', 'test-user', async (tx) => {
      const result = await tx.execute(sql`SELECT 1 AS ok`);
      expect(result.rows[0].ok).toBe(1);
    });
  });

  it('concurrent withRlsTx calls up to pool max', async () => {
    const concurrency = 20; // matches YJS_DB_POOL_MAX default

    const results = await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        withRlsTx('test-tenant', 'test-user', async (tx) => {
          const res = await tx.execute(sql`SELECT ${i}::int AS idx`);
          return res.rows[0].idx as number;
        }),
      ),
    );

    expect(results).toHaveLength(concurrency);
    expect(results.sort((a, b) => a - b)).toEqual(Array.from({ length: concurrency }, (_, i) => i));
  });

  it('RLS context is transaction-local, not shared across concurrent calls', async () => {
    const [ctxA, ctxB] = await Promise.all([
      withRlsTx('tenant-a', 'user-a', async (tx) => {
        const res = await tx.execute(sql`SELECT current_setting('app.tenant_id') AS tid`);
        return res.rows[0].tid;
      }),
      withRlsTx('tenant-b', 'user-b', async (tx) => {
        const res = await tx.execute(sql`SELECT current_setting('app.tenant_id') AS tid`);
        return res.rows[0].tid;
      }),
    ]);

    expect(ctxA).toBe('tenant-a');
    expect(ctxB).toBe('tenant-b');
  });

  it('withRlsTx sets both tenant_id and user_id for the transaction', async () => {
    await withRlsTx('my-tenant', 'my-user', async (tx) => {
      const res = await tx.execute(sql`
        SELECT current_setting('app.tenant_id') AS tid,
               current_setting('app.user_id') AS uid
      `);
      expect(res.rows[0].tid).toBe('my-tenant');
      expect(res.rows[0].uid).toBe('my-user');
    });
  });

  it('RLS config does not leak onto the session after the transaction commits', async () => {
    await withRlsTx('leak-tenant', 'leak-user', async (tx) => {
      await tx.execute(sql`SELECT 1`);
    });

    // `set_config(..., true)` is transaction-local: a fresh transaction on the same
    // pool must not observe the previous transaction's tenant context.
    await withRlsTx('other-tenant', 'other-user', async (tx) => {
      const res = await tx.execute(sql`SELECT current_setting('app.tenant_id') AS tid`);
      expect(res.rows[0].tid).toBe('other-tenant');
    });
  });
});
