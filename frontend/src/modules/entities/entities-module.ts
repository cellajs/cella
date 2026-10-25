import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'entities',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI shared across channel types, such as entity grids, tiles and settings pages.',
});
