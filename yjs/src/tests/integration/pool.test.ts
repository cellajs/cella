import { describe, expect, it } from 'vitest';
import { withClient } from '../../data/db';

describe('6.2 Pool behavior', () => {
  it('withClient releases connection back to pool even on error', async () => {
    // Run 50 iterations — if pool leaks, it will hang (pool exhausted at 20)
    for (let i = 0; i < 50; i++) {
      try {
        await withClient('test-tenant', 'test-user', async (client) => {
          if (i % 5 === 0) throw new Error('Simulated failure');
          await client.query('SELECT 1');
        });
      } catch {
        // Expected for every 5th iteration
      }
    }

    // Verify pool is still functional
    await withClient('test-tenant', 'test-user', async (client) => {
      const result = await client.query('SELECT 1 AS ok');
      expect(result.rows[0].ok).toBe(1);
    });
  });

  it('concurrent withClient calls up to pool max', async () => {
    const concurrency = 20; // matches YJS_DB_POOL_MAX default

    const results = await Promise.all(
      Array.from({ length: concurrency }, (_, i) =>
        withClient('test-tenant', 'test-user', async (client) => {
          const res = await client.query('SELECT $1::int AS idx', [i]);
          return res.rows[0].idx;
        }),
      ),
    );

    expect(results).toHaveLength(concurrency);
    expect(results.sort((a, b) => a - b)).toEqual(
      Array.from({ length: concurrency }, (_, i) => i),
    );
  });

  it('RLS context is set per-connection, not shared across concurrent calls', async () => {
    const [ctxA, ctxB] = await Promise.all([
      withClient('tenant-a', 'user-a', async (client) => {
        const res = await client.query("SELECT current_setting('app.tenant_id') AS tid");
        return res.rows[0].tid;
      }),
      withClient('tenant-b', 'user-b', async (client) => {
        const res = await client.query("SELECT current_setting('app.tenant_id') AS tid");
        return res.rows[0].tid;
      }),
    ]);

    expect(ctxA).toBe('tenant-a');
    expect(ctxB).toBe('tenant-b');
  });

  it('withClient sets both tenant_id and user_id in session', async () => {
    await withClient('my-tenant', 'my-user', async (client) => {
      const res = await client.query(`
        SELECT current_setting('app.tenant_id') AS tid,
               current_setting('app.user_id') AS uid
      `);
      expect(res.rows[0].tid).toBe('my-tenant');
      expect(res.rows[0].uid).toBe('my-user');
    });
  });
});
