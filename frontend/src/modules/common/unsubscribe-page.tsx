import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { buttonVariants } from '~/modules/ui/button';
import { useUserStore } from '~/store/user';
import { cn } from '~/utils/cn';

function UnsubscribePage() {
  const { t } = useTranslation();
  const { user } = useUserStore();

  return (
    <>
      <div className="container">
        <div className="flex flex-wrap mt-8 justify-center max-w-2xl mx-auto">
          <p className="text-3xl font-semibold">{t('common:unsubscribe_title')}</p>
          <p className="mt-2">{t('common:unsubscribe_text', { email: user.email })}</p>
          <Link to="/auth/sign-in" preload={false} className={cn('mt-4', buttonVariants())}>
            {t('common:sign_in')}
          </Link>
        </div>
      </div>
    </>
  );
}

export default UnsubscribePage;
