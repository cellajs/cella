import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'me',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for current user profile, settings, and account management.',
});
