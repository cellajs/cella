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
    description: 'RFC 9728 metadata of a protected resource: the authorization servers that issue its tokens and the scopes it accepts.',
    example: mockProtectedResourceResponse(),
    'x-tags': schemaTags('data', 'oauth-server', 'cella'),
  });
