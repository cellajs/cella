import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'me',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for current user profile, settings, and account management.',
});
