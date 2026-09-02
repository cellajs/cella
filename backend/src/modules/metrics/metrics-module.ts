import { defineBackendModule } from '#/lib/module';
import { metricHandlers } from './metrics-handlers';

defineBackendModule({
  name: 'metrics',
  owner: 'cella',
  scope: ['backend'],
  description: 'Endpoints for retrieving high-level counts for entities such as users and organizations.',
  routes: [{ path: '/metrics', app: metricHandlers }],
});
