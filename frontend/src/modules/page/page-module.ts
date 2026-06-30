import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'pages',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: 'UI for managing pages with realtime sync and offline capabilities.',
});
