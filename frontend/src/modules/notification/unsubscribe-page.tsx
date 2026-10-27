import { getRouteApi, Link } from '@tanstack/react-router';
import { BellOffIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthHeader } from '~/modules/auth/auth-header';
import { SubmitButton } from '~/modules/common/form-fields/submit-button';
import { useEmailCategoryMutation } from '~/modules/notification/query';
import { Button, buttonVariants } from '~/modules/ui/button';

const route = getRouteApi('/_public/auth/unsubscribe');

/**
 * The page an unsubscribe link opens. Nothing changes until the reader confirms: a mail scanner opening the link turns
 * nothing off. It names the category, never an address, and the same link turns the category back on.
 */
export function UnsubscribePage() {
  const { t } = useTranslation();
  const query = route.useSearch();
  const { category } = query;

  const { mutate, isPending, variables, isSuccess } = useEmailCategoryMutation();
  const unsubscribed = isSuccess && variables?.enabled === false;
  const resubscribed = isSuccess && variables?.enabled === true;

  const settingsLink = (
    <Link to="/account" hash="notifications" className={buttonVariants({ variant: 'secondary', className: 'w-full' })}>
      {t('c:notification_settings')}
    </Link>
  );

  if (resubscribed) {
    return (
      <>
        <AuthHeader title={t('c:unsubscribe_undone')}>
          <p className="font-light">{t('c:unsubscribe_undone.text')}</p>
        </AuthHeader>
        {settingsLink}
      </>
    );
  }

  if (unsubscribed) {
    return (
      <>
        <AuthHeader title={t('c:unsubscribe_done')}>
          <p className="font-light">{t(`c:unsubscribe_${category}.text`)}</p>
        </AuthHeader>
        <div className="flex flex-col gap-2">
          <Button variant="outline" className="w-full" disabled={isPending} onClick={() => mutate({ query, enabled: true })}>
            {t('c:unsubscribe_undo')}
          </Button>
          {settingsLink}
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeader title={t(`c:unsubscribe_${category}`)} />
      <div className="flex flex-col gap-2">
        <SubmitButton loading={isPending} icon={<BellOffIcon />} className="w-full" onClick={() => mutate({ query, enabled: false })}>
          {t('c:unsubscribe')}
        </SubmitButton>
        {settingsLink}
      </div>
    </>
  );
}
