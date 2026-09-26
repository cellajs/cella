import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { LogInIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getPendingMagicLink } from 'sdk';
import { appConfig } from 'shared';
import { Spinner } from '~/modules/common/spinner';
import { Button } from '~/modules/ui/button';

/**
 * Where a magic link opened in a browser that did not ask for it lands. It names the account the link signs in to and
 * signs in only on a click, a form post from this page, so a link planted in someone's browser or fetched by an email
 * scanner signs nobody in. The browser that asked for the link never sees this page.
 */
export function ConfirmSignInPage() {
  const { t } = useTranslation();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['auth', 'magic', 'pending'],
    queryFn: ({ signal }) => getPendingMagicLink({ signal }),
    retry: false,
  });

  if (isLoading) return <Spinner className="h-10 w-10" />;

  if (isError || !data) {
    return (
      <div className="text-center">
        <h1 className="text-2xl">{t('c:confirm_sign_in_expired')}</h1>
        <p className="my-4">{t('c:confirm_sign_in_expired.text')}</p>
        <Button render={<Link to="/auth/authenticate" replace />}>
          <LogInIcon className="mr-2" />
          {t('c:sign_in')}
        </Button>
      </div>
    );
  }

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('c:confirm_sign_in')}</h1>
      <p className="my-4">{t('c:confirm_sign_in.text', { email: data.email })}</p>
      <form method="post" action={`${appConfig.backendAuthUrl}/magic/confirm`}>
        <Button type="submit" className="w-full">
          <LogInIcon className="mr-2" />
          {t('c:continue_as', { email: data.email })}
        </Button>
      </form>
    </div>
  );
}
