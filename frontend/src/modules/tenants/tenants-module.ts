import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'tenants',
  owner: 'cella',
  scope: 'both',
  description: 'UI for managing tenants, top-level isolation boundaries used by Row-Level Security.',
});
