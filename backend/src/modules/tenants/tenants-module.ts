import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'tenants',
  owner: 'cella',
  scope: 'both',
  description: `System-level endpoints for managing tenants. Tenants are top-level isolation boundaries used by
    Row-Level Security (RLS) to partition data. Only system administrators can manage tenants.`,
});
