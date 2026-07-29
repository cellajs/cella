import { defineBackendModule } from '#/lib/module';

defineBackendModule({
  name: 'tenants',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing tenants, which are top-level isolation boundaries used by Row-Level
    Security (RLS) to partition data. Only system administrators can manage tenants.`,
});
