import { registerModule } from 'shared/module-registry';

registerModule({
  name: 'auth-server',
  owner: 'cella',
  scope: ['backend'],
  description: `Experimental OAuth 2.1 / OIDC Authorization Server (panva/node-oidc-provider) mounted
    in-process at \`\${backendUrl}/oauth\`. Issues audience-bound JWT access tokens for the MCP
    resource so external MCP clients can authenticate without browser sessions. Off by default
    (AUTH_SERVER_ENABLED); the same key/issuer infrastructure is intended to later back LTI 1.3.`,
});
