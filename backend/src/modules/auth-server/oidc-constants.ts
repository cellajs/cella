import { appConfig } from 'shared';

/**
 * Shared constants for the experimental OIDC Authorization Server and the MCP
 * resource-server guard. Kept import-light (no `oidc-provider`/`jose`) so the
 * MCP guard can reuse them without pulling in the provider.
 *
 * The Authorization Server is mounted in-process at `${backendUrl}/oauth`, so
 * the issuer is derived from the backend URL rather than a separate config URL.
 *
 * @see .todos/MCP_PLAN.md (Experiment 0)
 */

/** Path segment the OIDC provider is mounted under, relative to the API root. */
export const OIDC_MOUNT_PATH = '/oauth';

/** OIDC issuer identifier and base URL, e.g. `http://localhost:4000/oauth`. */
export const OIDC_ISSUER = `${appConfig.backendUrl}${OIDC_MOUNT_PATH}`;

/** JWKS endpoint the MCP guard fetches signing keys from. */
export const OIDC_JWKS_URI = `${OIDC_ISSUER}/jwks`;

/** MCP protocol + tool scopes. Domain scopes (e.g. `tasks:read`) come later. */
export const MCP_SCOPES = ['mcp:tools:read', 'mcp:tools:call'] as const;

/** Full space-delimited scope string advertised/granted for MCP clients. */
export const MCP_SCOPE = MCP_SCOPES.join(' ');

/**
 * Canonical MCP resource URI (RFC 8707 `resource`) for a tenant/org endpoint.
 * Used as both the issued token `aud` and the guard's expected audience.
 *
 * NOTE (open question in MCP_PLAN.md): this binds the resource to the route
 * path. A stable, path-independent resource id may replace this later.
 */
export const mcpResourceUri = (tenantId: string, organizationId: string): string =>
  `${appConfig.backendUrl}/${tenantId}/${organizationId}/mcp`;

/** Well-known URL that advertises the MCP protected-resource metadata. */
export const MCP_PROTECTED_RESOURCE_METADATA_URL = `${appConfig.backendUrl}/.well-known/oauth-protected-resource`;
