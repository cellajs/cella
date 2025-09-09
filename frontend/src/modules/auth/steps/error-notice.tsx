import AuthErrorNotice from '~/modules/auth/error-notice';
import { useAuthStepsContext } from '~/modules/auth/steps/provider';
import { ResendMembershipInviteButton } from '~/modules/memberships/resend-membership-invitation';

/**
 *
 */
export const AuthErrorStep = () => {
  const { email, authError } = useAuthStepsContext();

  return (
    <AuthErrorNotice error={authError}>
      {authError?.type === 'invite_takes_priority' && <ResendMembershipInviteButton resendData={{ email }} buttonProps={{ size: 'lg' }} />}
    </AuthErrorNotice>
  );
};
