import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LogInIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import { pendingMagicLinkQueryOptions } from '~/modules/auth/query';
import { ServerUnavailableAlert } from '~/modules/auth/server-unavailable-alert';
import { MiddleCut } from '~/modules/common/middle-cut';
import { NamedText } from '~/modules/common/named-text';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

/**
 * The page a magic link opens in a browser that did not ask for it. It names the account the link signs in to and
 * signs in only on a click, a form post from this page, so a link planted in someone's browser or fetched by an email
 * scanner signs nobody in. The browser that asked for the link never sees this page.
 */
export function ConfirmSignInPage() {
  const { t } = useTranslation();

  const { data, isLoading, error } = useQuery(pendingMagicLinkQueryOptions);

  if (isLoading) return <Spinner size="lg" />;

  // The route refuses a link that is gone with a 401: any other failure says nothing about the link.
  if (error?.status === 401) {
    return (
      <>
        <AuthHeader title={t('c:confirm_sign_in_expired')} description={t('c:confirm_sign_in_expired.text')} />
        <Button size="block" render={<Link to="/auth/authenticate" replace />}>
          <LogInIcon />
          {t('c:sign_in')}
        </Button>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <AuthHeader title={t('c:confirm_sign_in')} />
        <ServerUnavailableAlert />
      </>
    );
  }

  return (
    <>
      <AuthHeader title={t('c:confirm_sign_in')} description={<NamedText i18nKey="c:confirm_sign_in.text" values={{ email: data.email }} />} />
      <form method="post" action={`${appConfig.backendAuthUrl}/magic/confirm`}>
        <Button type="submit" size="block">
          <LogInIcon />
          <MiddleCut text={t('c:continue_as', { email: data.email })} />
        </Button>
      </form>
    </>
  );
}
