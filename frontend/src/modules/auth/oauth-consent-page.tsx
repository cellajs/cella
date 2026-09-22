import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Badge } from '~/modules/ui/badge';
import { Button } from '~/modules/ui/button';

/** What the authorization server's interaction route reports about a pending consent. */
interface ConsentDetails {
  client: { id: string; name: string; logoUri: string | null; kind: 'cimd' | 'registered' };
  scopes: string[];
  resource: { face: 'api' | 'mcp'; tenantId: string; organizationId?: string };
  user: { id: string; name: string };
  refusal: 'not_a_member' | 'clients_not_allowed' | 'app_not_installed' | null;
}

/** Literal records: the locale sweep only sees keys it can read. */
const scopeLabels: Record<string, TKey> = {
  'attachment:read': 'c:scope.attachment_read',
  'attachment:write': 'c:scope.attachment_write',
  'organization:read': 'c:scope.organization_read',
  'organization:write': 'c:scope.organization_write',
  'user:read': 'c:scope.user_read',
  'user:write': 'c:scope.user_write',
};

const refusalLabels: Record<NonNullable<ConsentDetails['refusal']>, TKey> = {
  not_a_member: 'c:oauth_refusal.not_a_member',
  clients_not_allowed: 'c:oauth_refusal.clients_not_allowed',
  app_not_installed: 'c:oauth_refusal.app_not_installed',
};

const interactionUrl = (uid: string, suffix: string) =>
  `${appConfig.oauthUrl}/interaction/${encodeURIComponent(uid)}/${suffix}`;

/**
 * The consent screen of the authorization server (D12): the provider redirects here with the interaction uid, the
 * page reads the details with the session cookie, and posts the decision back, then follows the provider's redirect.
 */
export function OAuthConsentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { uid } = useSearch({ from: '/_public/oauth/consent' });
  const [submitting, setSubmitting] = useState(false);

  const { data, error, isPending } = useQuery({
    queryKey: ['oauth', 'consent', uid],
    queryFn: async () => {
      const response = await fetch(interactionUrl(uid, 'details'), { credentials: 'include' });
      if (response.status === 401) {
        // No session: sign in and come back to this very interaction.
        const redirect = `/oauth/consent?uid=${encodeURIComponent(uid)}`;
        navigate({ to: '/auth/authenticate', search: { redirect }, replace: true });
        return null;
      }
      if (!response.ok) throw new Error(`consent_details_${response.status}`);
      return (await response.json()) as ConsentDetails;
    },
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const decide = async (accept: boolean) => {
    setSubmitting(true);
    try {
      const response = await fetch(interactionUrl(uid, 'consent'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accept }),
      });
      if (!response.ok) throw new Error(`consent_${response.status}`);
      const { redirectTo } = (await response.json()) as { redirectTo: string };
      window.location.assign(redirectTo);
    } catch (err) {
      console.error(err);
      toaster.error(t('c:error.oauth_consent_failed'));
      setSubmitting(false);
    }
  };

  if (isPending || !data) return <Spinner className="h-10 w-10" />;
  if (error) return <p className="text-center">{t('c:error.oauth_consent_expired')}</p>;

  const { client, scopes, refusal } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {client.logoUri && <img src={client.logoUri} alt="" className="h-12 w-12 rounded-md" />}
        <h1 className="text-2xl">{t('c:oauth_consent_header', { name: client.name })}</h1>
        <p className="text-muted-foreground text-sm">
          {t('c:oauth_consent.text', { name: client.name, appName: appConfig.name })}
        </p>
      </div>

      <ul className="flex flex-col gap-2 rounded-md border p-3">
        {scopes.map((scope) => (
          <li key={scope} className="flex items-center gap-2">
            <Badge variant="secondary" className="font-mono text-xs">
              {scope}
            </Badge>
            <span className="text-sm">{scopeLabels[scope] ? t(scopeLabels[scope]) : scope}</span>
          </li>
        ))}
      </ul>

      {refusal ? (
        <p className="text-center text-destructive text-sm">{t(refusalLabels[refusal])}</p>
      ) : (
        <p className="text-center text-muted-foreground text-xs">
          {t('c:oauth_consent_user.text', { name: data.user.name })}
        </p>
      )}

      <div className="flex justify-center gap-3">
        <Button variant="outline" disabled={submitting} onClick={() => decide(false)}>
          {t('c:cancel')}
        </Button>
        <Button disabled={submitting || !!refusal} onClick={() => decide(true)}>
          {t('c:accept')}
        </Button>
      </div>
    </div>
  );
}
