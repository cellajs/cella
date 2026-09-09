import { defineBackendModule } from '#/lib/module';
import { yjsHandlers } from './yjs-handlers';

defineBackendModule({
  name: 'yjs',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints for Yjs collaborative editing support: auth tokens for the Yjs relay worker, and the
    relay's secret-gated materialize route that writes a compacted collaborative document to its entity.`,
  routes: [{ path: '/yjs', app: yjsHandlers }],
});
