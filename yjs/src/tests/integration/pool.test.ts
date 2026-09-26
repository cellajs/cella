import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { db, withRlsTx } from '../../data/db';

describe('6.2 Pool behavior', () => {
  it('withRlsTx releases connection back to pool even on error', async () => {
    // 50 iterations against a pool of 20: a leaked connection hangs the loop.
    for (let i = 0; i < 50; i++) {
      try {
        await withRlsTx('test-tenant', 'test-user', async (tx) => {
          if (i % 5 === 0) throw new Error('Simulated failure');
          await tx.execute(sql`SELECT 1`);
        });
      } catch {
        // Expected on every 5th iteration.
      }
    }

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

  it('must not let the RLS context outlive its transaction: the same pooled connection answers a contextless query without it', async () => {
    // `set_config(..., true)` scopes both settings to the transaction. Set session-wide, they would ride along on the
    // pooled connection into whatever runs on it next.
    const inside = await withRlsTx('leak-tenant', 'leak-user', async (tx) => {
      const res = await tx.execute(
        sql`SELECT pg_backend_pid() AS pid, current_setting('app.tenant_id') AS tid, current_setting('app.user_id') AS uid`,
      );
      return res.rows[0];
    });
    expect(inside).toMatchObject({ tid: 'leak-tenant', uid: 'leak-user' });

    // The pool hands out its most recently released connection first, so this contextless query runs on the same one.
    const after = await db.execute(
      sql`SELECT pg_backend_pid() AS pid, current_setting('app.tenant_id', true) AS tid, current_setting('app.user_id', true) AS uid`,
    );
    expect(after.rows[0]).toEqual({ pid: inside.pid, tid: '', uid: '' });
  });
});
