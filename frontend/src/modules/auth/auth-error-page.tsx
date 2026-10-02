import { useMutation } from '@tanstack/react-query';
import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { LogInIcon, MailIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { sendSsoRecoveryLink } from 'sdk';
import { appConfig } from 'shared';
import { useAuthStore } from '~/modules/auth/auth-store';
import { ErrorNotice } from '~/modules/common/error-notice';
import { ResendInvitationButton } from '~/modules/memberships/resend-invitation-button';
import { Button } from '~/modules/ui/button';

const magicLinkEnabled = (appConfig.enabledAuthStrategies as readonly string[]).includes('magic');

export function AuthErrorPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { error: errorType, tokenId } = useSearch({ from: '/_public/auth/error' });

  const error = useAuthStore((state) => state.error);
  const setStep = useAuthStore((state) => state.setStep);
  const setMagicLinkMode = useAuthStore((state) => state.setMagicLinkMode);

  // Resending needs the expired invitation's token id: an address alone would tell anyone who was invited.
  const resendTokenId = errorType === 'invitation_expired' ? tokenId : undefined;
  // Any other refusal of an invitation round trip (a provider account on another address) resumes the invitation.
  const resumeTokenId = resendTokenId ? undefined : tokenId;

  // An institution sign-in found the address on an existing account: this browser may ask once for a sign-in link to
  // that address, which lands on the account page to connect the institution account.
  const offersRecoveryLink = errorType === 'sso_email_exists' && magicLinkEnabled;
  const { mutate: sendRecoveryLink, isPending: isSendingRecoveryLink } = useMutation({
    mutationFn: () => sendSsoRecoveryLink(),
    onSuccess: ({ email }) => {
      setMagicLinkMode('signin');
      setStep('magicLinkSent', email);
      navigate({ to: '/auth/authenticate', replace: true });
    },
  });

  const hasPrimaryAction = !!resendTokenId || offersRecoveryLink;

  return (
    <ErrorNotice error={error} boundary="public">
      {resendTokenId && <ResendInvitationButton resendData={{ tokenId: resendTokenId }} />}

      {offersRecoveryLink && (
        <Button loading={isSendingRecoveryLink} onClick={() => sendRecoveryLink()}>
          <MailIcon />
          {t('c:sso_recovery_send')}
        </Button>
      )}

      <Button
        variant={hasPrimaryAction ? 'plain' : 'default'}
        render={<Link to="/auth/authenticate" search={resumeTokenId ? { tokenId: resumeTokenId } : {}} replace />}
      >
        <LogInIcon />
        {t('c:sign_in')}
      </Button>
    </ErrorNotice>
  );
}
