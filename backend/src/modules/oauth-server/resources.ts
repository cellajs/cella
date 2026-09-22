import { appConfig } from 'shared';

/** The two audiences a cella-issued token can carry: the MCP server of an organization, or the REST API of a tenant. */
export type ResourceRef = { face: 'mcp'; tenantId: string; organizationId: string } | { face: 'api'; tenantId: string };

/** RFC 8707 resource identifiers are tenant-qualified (D7), so a token never crosses tenants. */
export function resourceUri(ref: ResourceRef): string {
  return ref.face === 'mcp'
    ? `${appConfig.mcpUrl}/${ref.tenantId}/${ref.organizationId}/mcp`
    : `${appConfig.backendUrl}/t/${ref.tenantId}`;
}

/** Null for anything that is not one of this deployment's resources. */
export function parseResource(uri: string): ResourceRef | null {
  const mcp = new RegExp(`^${escapeRegExp(appConfig.mcpUrl)}/([^/]+)/([^/]+)/mcp$`).exec(uri);
  if (mcp) return { face: 'mcp', tenantId: mcp[1].toLowerCase(), organizationId: mcp[2] };
  const api = new RegExp(`^${escapeRegExp(appConfig.backendUrl)}/t/([^/]+)$`).exec(uri);
  if (api) return { face: 'api', tenantId: api[1].toLowerCase() };
  return null;
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
