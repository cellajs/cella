import { defineBackendModule } from '#/lib/module';
import { oidcPayloadsSweepJob } from '#/modules/oauth-server/oidc-payloads-sweep';

defineBackendModule({
  name: 'oauth-server',
  owner: 'cella',
  scope: ['backend'],
  description: `The authorization server: node-oidc-provider on the app origin under /oauth, issuing the access
    tokens the API and the MCP endpoint accept. Runs as its own process (MODE=oauth) or folded into the API under
    singleVM; the store it writes is swept by the API's job runner.`,
  jobs: [oidcPayloadsSweepJob],
});
