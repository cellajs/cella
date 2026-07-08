import { Hono } from 'hono';
import { appConfig } from 'shared';
import type { Env } from '#/core/context';
import { MCP_SCOPES, mcpResourceUri, OIDC_ISSUER } from '#/modules/auth-server/oidc-constants';

/**
 * OAuth Protected Resource Metadata (RFC 9728) for the MCP endpoint.
 *
 * A standards-compliant MCP client that gets a `401` with
 * `WWW-Authenticate: Bearer resource_metadata="<url>"` fetches this document to
 * discover which Authorization Server issues tokens for the resource, then runs
 * the OAuth flow bound to that `resource`.
 *
 * Served unauthenticated and mounted before the tenant-scoped param routes.
 * Path-specific metadata lives under the RFC 9728 convention
 * `/.well-known/oauth-protected-resource/<resource-path>`.
 */
const app = new Hono<Env>();

const metadata = (resource: string) => ({
  resource,
  authorization_servers: [OIDC_ISSUER],
  scopes_supported: [...MCP_SCOPES],
  bearer_methods_supported: ['header'],
});

// Root metadata: for clients that probe the non-path-specific well-known before
// they know a tenant/org. Advertises the same Authorization Server; `resource` is
// the backend base (per-org resources use the path-specific document below).
app.get('/.well-known/oauth-protected-resource', (c) => c.json(metadata(appConfig.backendUrl)));

// Per-resource metadata for a specific tenant/org MCP endpoint.
app.get('/.well-known/oauth-protected-resource/:tenantId/:organizationId/mcp', (c) => {
  const { tenantId, organizationId } = c.req.param();
  return c.json(metadata(mcpResourceUri(tenantId, organizationId)));
});

export const mcpWellKnownHandlers = app;
