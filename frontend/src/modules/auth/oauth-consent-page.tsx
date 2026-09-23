import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import type { TKey } from '~/lib/i18n-locales';
import type { ConsentDetails } from '~/lib/oauth-interaction';
import { consentDetailsQueryOptions, useDecideConsentMutation } from '~/modules/auth/oauth-consent-query';
import { ErrorNotice, type ErrorNoticeError } from '~/modules/common/error-notice';
import { ScopeBadges } from '~/modules/common/scope-badges';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

const refusalLabels: Record<NonNullable<ConsentDetails['refusal']>, TKey> = {
  not_a_member: 'c:oauth_refusal.not_a_member',
  unregistered_clients_not_allowed: 'c:oauth_refusal.unregistered_clients_not_allowed',
  app_not_installed: 'c:oauth_refusal.app_not_installed',
};

/**
 * The consent screen of the authorization server (D12): the provider redirects here with the interaction uid, the
 * page reads the details with the session cookie, and posts the decision back, then follows the provider's redirect.
 */
export function OAuthConsentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { uid } = useSearch({ from: '/_public/auth/consent' });

  const { data, error, isPending } = useQuery(consentDetailsQueryOptions(uid));
  const { mutate: decide, isPending: deciding } = useDecideConsentMutation(uid);

  // No session: sign in and come back to this very interaction.
  const unauthenticated = error?.status === 401;
  useEffect(() => {
    if (!unauthenticated) return;
    const redirect = `/auth/consent?uid=${encodeURIComponent(uid)}`;
    navigate({ to: '/auth/authenticate', search: { redirect }, replace: true });
  }, [unauthenticated, navigate, uid]);

  // An expired or unknown interaction is an answer, not a wait.
  if (error && !unauthenticated) return <ErrorNotice error={error as ErrorNoticeError} boundary="public" />;
  if (isPending || !data) return <Spinner className="h-10 w-10" />;

  const { client, scopes, refusal } = data;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-center gap-3 text-center">
        {client.logoUri && (
          <img
            src={client.logoUri}
            alt=""
            className="h-12 w-12 rounded-md"
            loading="lazy"
            referrerPolicy="no-referrer"
          />
        )}
        <h1 className="text-2xl">{t('c:oauth_consent_header', { name: client.name })}</h1>
        <p className="text-muted-foreground text-sm">
          {t('c:oauth_consent.text', { name: client.name, appName: appConfig.name })}
        </p>
      </div>

      <div className="rounded-md border p-3">
        <ScopeBadges scopes={scopes} withLabels />
      </div>

      {refusal ? (
        <p className="text-center text-destructive text-sm">{t(refusalLabels[refusal])}</p>
      ) : (
        <p className="text-center text-muted-foreground text-xs">
          {t('c:oauth_consent_user.text', { name: data.user.name })}
        </p>
      )}

      <div className="flex justify-center gap-3">
        <Button variant="outline" loading={deciding} onClick={() => decide(false)}>
          {t('c:cancel')}
        </Button>
        <Button loading={deciding} disabled={!!refusal} onClick={() => decide(true)}>
          {t('c:accept')}
        </Button>
      </div>
    </div>
  );
}
