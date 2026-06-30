import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'pages',
  owner: 'cella',
  scope: ['frontend', 'backend'],
  description: `Endpoints for managing pages, which are product entities supporting realtime sync and offline
    capabilities. Pages can be organized hierarchically and are used in /docs.`,
});
