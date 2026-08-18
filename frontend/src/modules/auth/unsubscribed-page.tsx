import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

export function Unsubscribed() {
  const { t } = useTranslation();
  const { user } = useUserStore();

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('c:unsubscribe_title')}</h1>
      <p className="mt-4">{t('c:unsubscribe_text', { email: user?.email ?? '' })}</p>
      <Button className="mt-6" render={<Link to="/auth/authenticate" preload={false} />}>
        {t('c:sign_in')}
      </Button>
    </div>
  );
}
