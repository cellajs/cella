import type { Restrictions } from '#/modules/tenants/tenants-schema';
import type { MergePatch } from '#/utils/merge-patch';
import { type BenchSeedContext, registerBenchSeed } from '../registry';
import { TENANT_ID } from './ids';

/**
 * Upserts a bench tenant without an attachment cap and with a points budget no scenario spends. The seeded attachments
 * pass the default cap of 100, which refuses every create past it.
 */
export async function upsertBenchTenant(pool: BenchSeedContext['pool'], id: string, name: string, now: string): Promise<void> {
  const patch = { quotas: { attachment: 'unlimited' }, rateLimits: { apiPointsPerHour: 10_000_000 } } satisfies MergePatch<Restrictions>;
  const restrictions = JSON.stringify(patch);
  await pool.query(
    'INSERT INTO tenants (id, name, restrictions, created_at) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (id) DO UPDATE SET restrictions = $3::jsonb',
    [id, name, restrictions, now],
  );
}

registerBenchSeed({
  kind: 'custom',
  name: 'tenant',
  order: 10,
  cleanup: async ({ client }) => {
    await client.query('DELETE FROM tenants WHERE id = $1', [TENANT_ID]);
  },
  seed: ({ now, pool }) => upsertBenchTenant(pool, TENANT_ID, 'Load Test Tenant', now),
});

registerBenchSeed({
  kind: 'custom',
  name: 'activities',
  order: 90,
  cleanup: async ({ client }) => {
    await client.query('DELETE FROM activities WHERE tenant_id = $1', [TENANT_ID]);
  },
});
