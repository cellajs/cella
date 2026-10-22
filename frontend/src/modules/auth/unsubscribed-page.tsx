import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AuthHeader } from '~/modules/auth/auth-header';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

export function Unsubscribed() {
  const { t } = useTranslation();
  const user = useUserStore((state) => state.user);

  return (
    <>
      <AuthHeader title={t('c:unsubscribe_title')}>
        <p>{t('c:unsubscribe_text', { email: user?.email ?? '' })}</p>
      </AuthHeader>
      <Button render={<Link to="/auth/authenticate" preload={false} />}>{t('c:sign_in')}</Button>
    </>
  );
}
