import { appConfig } from 'shared';
import type { ConsentDetails } from 'shared/oauth-consent';
import { apiFetch } from '~/lib/api-client';

/** The interaction routes live on the authorization server, outside the OpenAPI spec, so no SDK function exists. */
const interactionUrl = (uid: string, suffix: string) => `${appConfig.oauthUrl}/interaction/${encodeURIComponent(uid)}/${suffix}`;

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(url, init);
  return response.json();
}

export const getConsentDetails = (uid: string) => request<ConsentDetails>(interactionUrl(uid, 'details'));

export const decideConsent = (uid: string, accept: boolean) =>
  request<{ redirectTo: string }>(interactionUrl(uid, 'consent'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accept }),
  });
