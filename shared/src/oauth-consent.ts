/** The two audiences a token from this server can carry: the MCP server of an organization, or the REST API of a tenant. */
export type ResourceRef = { face: 'mcp'; tenantId: string; organizationId: string } | { face: 'api'; tenantId: string };

/** Why a person's grant does not hold. */
export type UserGrantRefusal = 'unknown_user' | 'not_a_member' | 'app_not_installed' | 'unregistered_clients_not_allowed';

/** What the authorization server's interaction route reports about a pending consent to a signed-in user. */
export interface ConsentDetails {
  client: { id: string; name: string; logoUri: string | null; kind: 'cimd' | 'registered' };
  /**
   * The host of the redirect URI the authorization goes to, or the URI itself for an app's own scheme, shown beside the
   * client: a client's name proves nothing about it.
   */
  redirectHost: string;
  scopes: string[];
  resource: ResourceRef;
  /** The names of the tenant and, on the MCP face, the organization the grant reaches; null where the user is not a member. */
  target: { tenant: string | null; organization: string | null };
  user: { id: string; name: string };
  /** What the provider is asking for (`login`, `consent`) and why; the page shows the reasons when it refuses. */
  prompt: { name: string; reasons: string[] };
  /** Why the consent page must refuse (the grant policy's answer); null when the user may accept. */
  refusal: Exclude<UserGrantRefusal, 'unknown_user'> | null;
}
