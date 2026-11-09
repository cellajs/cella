import { useQuery } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ConsentDetails } from 'shared/oauth-consent';
import type { TKey } from '~/lib/i18n-locales';
import { AuthHeader } from '~/modules/auth/auth-header';
import { consentDetailsQueryOptions, useDecideConsentMutation } from '~/modules/auth/query';
import { ErrorNotice } from '~/modules/common/error-notice';
import { NamedText } from '~/modules/common/named-text';
import { ScopeBadges } from '~/modules/common/scope-badges';
import { Spinner } from '~/modules/common/spinner';
import { Button, glassClass } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

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
  const { mutate: decide, isPending: deciding, variables: accepting } = useDecideConsentMutation(uid);

  // No session: sign in and come back to this very interaction.
  const unauthenticated = error?.status === 401;
  useEffect(() => {
    if (!unauthenticated) return;
    const redirect = `/auth/consent?uid=${encodeURIComponent(uid)}`;
    navigate({ to: '/auth/authenticate', search: { redirect }, replace: true });
  }, [unauthenticated, navigate, uid]);

  // An expired or unknown interaction is an answer, not a wait.
  if (error && !unauthenticated) return <ErrorNotice error={error} boundary="auth" />;
  if (isPending || !data) return <Spinner size="lg" />;

  const { client, redirectHost, scopes, refusal, target } = data;

  return (
    <>
      <AuthHeader
        image={client.logoUri && <img src={client.logoUri} alt="" className="size-14 rounded-md" loading="lazy" referrerPolicy="no-referrer" />}
        title={t('c:oauth_consent_header', { name: client.name })}
        description={t('c:oauth_consent.text', { name: client.name })}
      >
        <p className="text-sm">
          <NamedText i18nKey="c:oauth_consent_redirect.text" values={{ host: redirectHost }} />
        </p>
        {target.tenant && (
          <p className="text-sm">
            {target.organization
              ? t('c:oauth_consent_target.organization', { organization: target.organization, tenant: target.tenant })
              : t('c:oauth_consent_target.tenant', { tenant: target.tenant })}
          </p>
        )}
      </AuthHeader>

      <div className={cn(glassClass, 'rounded-xl border p-3')}>
        <ScopeBadges scopes={scopes} withLabels />
      </div>

      {refusal ? (
        <p className="text-destructive text-center text-sm">{t(refusalLabels[refusal])}</p>
      ) : (
        <p className="text-muted-foreground text-center text-xs">{t('c:oauth_consent_user.text', { name: data.user.name })}</p>
      )}

      <div className="flex flex-col gap-2">
        <Button size="block" loading={deciding && accepting} disabled={deciding || !!refusal} onClick={() => decide(true)}>
          {t('c:accept')}
        </Button>
        <Button variant="glass" size="block" loading={deciding && !accepting} disabled={deciding} onClick={() => decide(false)}>
          {t('c:cancel')}
        </Button>
      </div>
    </>
  );
}
