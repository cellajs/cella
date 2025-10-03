import { Link, useSearch } from '@tanstack/react-router';
import { LogIn } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import ErrorNotice from '~/modules/common/error-notice';
import { ResendMembershipInviteButton } from '~/modules/memberships/resend-membership-invitation';
import { buttonVariants } from '~/modules/ui/button';
import { useAuthStore } from '~/store/auth';

/**
 * Displays an error notice in authentication layout.
 */
const AuthErrorPage = () => {
  const { t } = useTranslation();

  const { error: errorType, tokenId } = useSearch({ from: '/publicLayout/authLayout/auth/error' });

  const { email, error } = useAuthStore();

  // Show a resend invitation button if necessary
  const showResendButton = error?.type === 'invite_takes_priority' || errorType === 'invitation_expired';
  const resendData = tokenId ? { tokenId } : email ? { email } : false;

  return (
    <ErrorNotice error={error} level={'public'}>
      {showResendButton && resendData && <ResendMembershipInviteButton resendData={resendData} />}

      <Link to="/auth/authenticate" replace className={buttonVariants({ variant: showResendButton ? 'plain' : 'default' })}>
        <LogIn size={16} className="mr-2" />
        {t('common:sign_in')}
      </Link>
    </ErrorNotice>
  );
};

export default AuthErrorPage;
