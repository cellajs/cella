import { useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { AuthHeader } from '~/modules/auth/auth-header';
import { Button } from '~/modules/ui/button';

/**
 * Where an opened confirmation link lands. The tab that asked holds the action and carries on by itself, so this page
 * sends the user back to it; its link to the page that asked is for when that tab is gone.
 */
export function StepUpConfirmedPage() {
  const { t } = useTranslation();
  const { redirect } = useSearch({ from: '/_public/auth/step-up-confirmed' });

  return (
    <>
      <AuthHeader title={t('c:step_up_confirmed')}>
        <p>{t('c:step_up_confirmed.text')}</p>
      </AuthHeader>
      <Button variant="plain" render={<a href={redirect ?? appConfig.defaultRedirectPath} />}>
        {t('c:step_up_continue')}
      </Button>
    </>
  );
}
