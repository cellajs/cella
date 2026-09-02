import { defineBackendModule } from '#/lib/module';
import { yjsHandlers } from './yjs-handlers';

defineBackendModule({
  name: 'yjs',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints for Yjs collaborative editing support. They provide auth tokens for the Yjs relay worker
    and accept client-computed derived fields from collaborative editing sessions.`,
  routes: [{ path: '/yjs', app: yjsHandlers }],
});
