import { registerBenchSeed } from '../registry';
import { TENANT_ID } from './ids';

registerBenchSeed({
  kind: 'custom',
  name: 'tenant',
  order: 10,
  cleanup: async ({ client }) => {
    await client.query('DELETE FROM tenants WHERE id = $1', [TENANT_ID]);
  },
  seed: async ({ now, pool }) => {
    const restrictions = JSON.stringify({ quotas: {}, rateLimits: { apiPointsPerHour: 10_000_000 } });
    await pool.query(
      'INSERT INTO tenants (id, name, restrictions, created_at) VALUES ($1, $2, $3::jsonb, $4) ON CONFLICT (id) DO UPDATE SET restrictions = $3::jsonb',
      [TENANT_ID, 'Load Test Tenant', restrictions, now],
    );
  },
});

registerBenchSeed({
  kind: 'custom',
  name: 'activities',
  order: 90,
  cleanup: async ({ client }) => {
    await client.query('DELETE FROM activities WHERE tenant_id = $1', [TENANT_ID]);
  },
});
