import { Link, useSearch } from '@tanstack/react-router';
import { LogInIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '~/modules/auth/auth-store';
import { ErrorNotice } from '~/modules/common/error-notice';
import { ResendInvitationButton } from '~/modules/memberships/resend-invitation-button';
import { Button } from '~/modules/ui/button';

export function AuthErrorPage() {
  const { t } = useTranslation();

  const { error: errorType, tokenId } = useSearch({ from: '/_public/auth/error' });

  const error = useAuthStore((state) => state.error);

  // Resending needs the expired invitation's token id: an address alone would tell anyone who was invited.
  const resendTokenId = errorType === 'invitation_expired' ? tokenId : undefined;
  // Any other refusal of an invitation round trip (a provider account on another address) resumes the invitation.
  const resumeTokenId = resendTokenId ? undefined : tokenId;

  return (
    <ErrorNotice error={error} boundary="public">
      {resendTokenId && <ResendInvitationButton resendData={{ tokenId: resendTokenId }} />}

      <Button
        variant={resendTokenId ? 'plain' : 'default'}
        render={<Link to="/auth/authenticate" search={resumeTokenId ? { tokenId: resumeTokenId } : {}} replace />}
      >
        <LogInIcon />
        {t('c:sign_in')}
      </Button>
    </ErrorNotice>
  );
}
