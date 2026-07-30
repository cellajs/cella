import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'tenants',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing tenants, top-level isolation boundaries used by Row-Level Security.',
});
