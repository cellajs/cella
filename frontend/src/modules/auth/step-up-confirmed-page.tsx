import { useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { Button } from '~/modules/ui/button';

/**
 * Where an opened confirmation link lands. The tab that asked holds the action and carries on by itself, so this page
 * sends the user back to it; its link to the page that asked is for when that tab is gone.
 */
export function StepUpConfirmedPage() {
  const { t } = useTranslation();
  const { redirect } = useSearch({ from: '/_public/auth/step-up-confirmed' });

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('c:step_up_confirmed')}</h1>
      <p className="my-4">{t('c:step_up_confirmed.text')}</p>
      <Button variant="plain" render={<a href={redirect ?? appConfig.defaultRedirectPath} />}>
        {t('c:step_up_continue')}
      </Button>
    </div>
  );
}
