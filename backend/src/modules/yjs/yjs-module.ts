import { defineBackendModule } from '#/lib/module';
import { yjsHandlers } from './yjs-handlers';

defineBackendModule({
  name: 'yjs',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints for Yjs collaborative editing support: a short-lived token per entity for the Yjs relay
    worker. The relay's materialize route, which writes a compacted collaborative document to its entity, is served
    on the internal listener only.`,
  routes: [{ path: '/:tenantId/:organizationId/yjs', app: yjsHandlers, phase: 'tenant' }],
});
