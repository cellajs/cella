import { defineBackendModule } from '#/lib/module';
import { yjsHandlers } from './yjs-handlers';
import { yjsLegacyHandlers } from './yjs-legacy-handlers';

defineBackendModule({
  name: 'yjs',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints for Yjs collaborative editing support: a short-lived token per entity for the Yjs relay
    worker. The relay's materialize route, which writes a compacted collaborative document to its entity, is served
    on the internal listener only.`,
  routes: [
    { path: '/:tenantId/:organizationId/yjs', app: yjsHandlers, phase: 'tenant' },
    // TODO(rollout): the public materialize path answers 503 for one release; see yjs-legacy-handlers.ts.
    { path: '/yjs', app: yjsLegacyHandlers },
  ],
});
