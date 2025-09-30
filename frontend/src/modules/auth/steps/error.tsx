import { useAuthStepsContext } from '~/modules/auth/steps/provider-context';
import ErrorNotice from '~/modules/common/error-notice';
import { ResendMembershipInviteButton } from '~/modules/memberships/resend-membership-invitation';

/**
 * Displays an authentication error notice.
 * If the error type is `invite_takes_priority`, shows a button to resend the invite.
 */
export const AuthErrorStep = () => {
  const { email, authError } = useAuthStepsContext();

  return (
    <ErrorNotice error={authError} level={'public'}>
      {authError?.type === 'invite_takes_priority' && <ResendMembershipInviteButton resendData={{ email }} buttonProps={{ size: 'lg' }} />}
    </ErrorNotice>
  );
};
