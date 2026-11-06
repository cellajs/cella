import { accessScopes, appConfig } from 'shared';
import type { ResourceRef } from 'shared/oauth-consent';
import { escapeRegExp } from 'shared/utils/escape-regexp';

export type { ResourceRef };

/**
 * RFC 8707 resource identifiers are tenant-qualified, so a token never crosses tenants. Each is the URL of its resource
 * (the tenant, or an organization's MCP endpoint), so `resourceMetadataUrl` below it is a route. The ids are
 * percent-encoded: a guard builds its challenge header from the ids of the request path, before anything checked them.
 */
export function resourceUri(ref: ResourceRef): string {
  const tenantId = encodeURIComponent(ref.tenantId);
  return ref.face === 'mcp'
    ? `${appConfig.mcpUrl}/tenants/${tenantId}/organizations/${encodeURIComponent(ref.organizationId)}/mcp`
    : `${appConfig.backendUrl}/tenants/${tenantId}`;
}

/** The URI with its scheme and host lowercased, which compare case-insensitively (RFC 3986 §6.2.2.1); the path stays as written. */
const withLowercaseOrigin = (uri: string) => uri.replace(/^[^:/?#]+:\/\/[^/?#]*/, (origin) => origin.toLowerCase());

const mcpResource = new RegExp(`^${escapeRegExp(withLowercaseOrigin(appConfig.mcpUrl))}/tenants/([^/]+)/organizations/([^/]+)/mcp$`);
const apiResource = new RegExp(`^${escapeRegExp(withLowercaseOrigin(appConfig.backendUrl))}/tenants/([^/]+)$`);

/** Null for anything that is not one of this deployment's resources. The tenant id reads lowercased, as `routeTarget` reads it. */
export function parseResource(uri: string): ResourceRef | null {
  const canonical = withLowercaseOrigin(uri);
  const mcp = mcpResource.exec(canonical);
  if (mcp) return { face: 'mcp', tenantId: mcp[1].toLowerCase(), organizationId: mcp[2] };
  const api = apiResource.exec(canonical);
  if (api) return { face: 'api', tenantId: api[1].toLowerCase() };
  return null;
}

/** Every read scope of the catalog, space-separated: the 401 challenge names it so a client's first consent grants no write. */
export const mcpInitialScope = accessScopes.all.filter((scope) => scope.endsWith(':read')).join(' ');

/** RFC 9728: where a protected resource publishes its metadata; the `WWW-Authenticate` challenge points here. */
export function resourceMetadataUrl(ref: ResourceRef): string {
  return `${resourceUri(ref)}/.well-known/oauth-protected-resource`;
}

/** What a challenge refuses: a proof (`invalid_token`, with the reason) or a call outside the token's scopes. */
type ChallengeRefusal = { error: 'invalid_token'; description: string } | { error: 'insufficient_scope'; scope: string };

/**
 * The `WWW-Authenticate` value of every machine-facing refusal (RFC 6750 §3): the error, where the resource publishes its
 * metadata (RFC 9728 §5.1), and the scope to ask for. A request with no proof gets no error. On the MCP face the scope
 * of a 401 is `mcpInitialScope`; a step-up names the scope the call lacks.
 * @param ref - The resource the request addressed; null on a route outside every tenant, whose challenge names no metadata.
 */
export function bearerChallenge(ref: ResourceRef | null, refusal?: ChallengeRefusal): string {
  const initialScope = ref?.face === 'mcp' ? mcpInitialScope : '';
  const scope = refusal?.error === 'insufficient_scope' ? refusal.scope : initialScope;
  const params = [
    refusal && `error="${refusal.error}"`,
    refusal?.error === 'invalid_token' && `error_description="${refusal.description}"`,
    ref && `resource_metadata="${resourceMetadataUrl(ref)}"`,
    scope && `scope="${scope}"`,
  ].filter(Boolean);
  return params.length ? `Bearer ${params.join(', ')}` : 'Bearer';
}

/** RFC 9728: the metadata document served at `resourceMetadataUrl`. */
export function protectedResourceMetadata(ref: ResourceRef) {
  return {
    resource: resourceUri(ref),
    authorization_servers: [appConfig.oauthUrl],
    scopes_supported: [...accessScopes.all],
    bearer_methods_supported: ['header'],
    resource_documentation: `${appConfig.frontendUrl}/docs`,
  };
}
