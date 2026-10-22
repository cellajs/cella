import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LogInIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import { pendingMagicLinkQueryOptions } from '~/modules/auth/query';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

/**
 * The page a magic link opens in a browser that did not ask for it. It names the account the link signs in to and
 * signs in only on a click, a form post from this page, so a link planted in someone's browser or fetched by an email
 * scanner signs nobody in. The browser that asked for the link never sees this page.
 */
export function ConfirmSignInPage() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery(pendingMagicLinkQueryOptions);

  if (isLoading) return <Spinner size="lg" />;

  if (isError || !data) {
    return (
      <>
        <AuthHeader title={t('c:confirm_sign_in_expired')}>
          <p>{t('c:confirm_sign_in_expired.text')}</p>
        </AuthHeader>
        <Button render={<Link to="/auth/authenticate" replace />}>
          <LogInIcon />
          {t('c:sign_in')}
        </Button>
      </>
    );
  }

  return (
    <>
      <AuthHeader title={t('c:confirm_sign_in')}>
        <p>{t('c:confirm_sign_in.text', { email: data.email })}</p>
      </AuthHeader>
      <form method="post" action={`${appConfig.backendAuthUrl}/magic/confirm`}>
        <Button type="submit" className="w-full">
          <LogInIcon />
          {t('c:continue_as', { email: data.email })}
        </Button>
      </form>
    </>
  );
}
