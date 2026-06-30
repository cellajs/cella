import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'yjs',
  owner: 'cella',
  scope: ['backend'],
  description: `Endpoints for Yjs collaborative editing support. Provides auth tokens for the Yjs relay worker and
    accepts client-computed derived fields from collaborative editing sessions.`,
});
