import { z } from '@hono/zod-openapi';
import { schemaTags } from '#/core/openapi-helpers';
import { mockProtectedResourceResponse } from './oauth-server-mocks';

/** RFC 9728 protected resource metadata: what a client reads to find the authorization server of a resource. */
export const protectedResourceSchema = z
  .object({
    resource: z.string(),
    authorization_servers: z.array(z.string()),
    scopes_supported: z.array(z.string()),
    bearer_methods_supported: z.array(z.string()),
    resource_documentation: z.string(),
  })
  .openapi('ProtectedResourceMetadata', {
    description:
      'How an OAuth client gets an access token for this API or an MCP endpoint (RFC 9728): the authorization servers that issue tokens and the scopes accepted. A client finds it through the `WWW-Authenticate` header of a 401 response.',
    example: mockProtectedResourceResponse(),
    'x-tags': schemaTags('data', 'oauth-server', 'cella'),
  });
