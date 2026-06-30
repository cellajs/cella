import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'auth',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'Authentication UI supporting multiple sign-in methods, including OAuth and passkeys.',
});
