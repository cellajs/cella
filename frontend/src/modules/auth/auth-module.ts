import { defineFrontendModule } from '~/lib/module';

defineFrontendModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Authentication UI supporting multiple sign-in methods, including OAuth and passkeys.',
});
