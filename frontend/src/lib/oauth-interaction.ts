import { appConfig } from 'shared';
import { ApiError, clientConfig } from '~/lib/api';

/** What the authorization server's interaction route reports about a pending consent. */
export interface ConsentDetails {
  client: { id: string; name: string; logoUri: string | null; kind: 'cimd' | 'registered' };
  scopes: string[];
  resource: { face: 'api' | 'mcp'; tenantId: string; organizationId?: string };
  user: { id: string; name: string };
  prompt: { name: string; reasons: string[] };
  refusal: 'not_a_member' | 'clients_not_allowed' | 'app_not_installed' | null;
}

/** The interaction routes live on the authorization server, outside the OpenAPI spec, so no SDK function exists. */
const interactionUrl = (uid: string, suffix: string) =>
  `${appConfig.oauthUrl}/interaction/${encodeURIComponent(uid)}/${suffix}`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await clientConfig.fetch(url, init);
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as Partial<ApiError>;
    throw new ApiError({ ...body, status: response.status as ApiError['status'] });
  }
  return (await response.json()) as T;
}

export const getConsentDetails = (uid: string) => request<ConsentDetails>(interactionUrl(uid, 'details'));

export const decideConsent = (uid: string, accept: boolean) =>
  request<{ redirectTo: string }>(interactionUrl(uid, 'consent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept }),
  });
