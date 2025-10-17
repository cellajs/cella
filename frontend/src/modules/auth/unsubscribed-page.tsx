import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

function Unsubscribed() {
  const { t } = useTranslation();
  const { user } = useUserStore();

  return (
    <div className="text-center">
      <h1 className="text-2xl">{t('common:unsubscribe_title')}</h1>
      <p className="font-light mt-4">{t('common:unsubscribe_text', { email: user.email })}</p>
      <Link to="/auth/authenticate" preload={false} className={cn('mt-6', buttonVariants())}>
        {t('common:sign_in')}
      </Link>
    </div>
  );
}

export default Unsubscribed;
