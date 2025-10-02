import { Link } from '@tanstack/react-router';
import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ErrorNotice from '~/modules/common/error-notice';
import { ResendMembershipInviteButton } from '~/modules/memberships/resend-membership-invitation';
import { buttonVariants } from '~/modules/ui/button';
import { useAuthStore } from '~/store/auth';

/**
 * Displays an error notice in authentication layout.
 */
export const AuthError = () => {
  const { t } = useTranslation();

  const { email, error } = useAuthStore();

  return (
    <ErrorNotice error={error} level={'public'}>
      <Link to="/auth/authenticate" replace className={buttonVariants({ size: 'lg' })}>
        <LogIn size={16} className="mr-2" />
        {t('common:sign_in')}
      </Link>

      {error?.type === 'invite_takes_priority' && <ResendMembershipInviteButton resendData={{ email }} buttonProps={{ size: 'lg' }} />}
    </ErrorNotice>
  );
};
