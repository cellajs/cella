import { useNavigate } from '@tanstack/react-router';
import { ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthEmailButton, AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { authFieldClass } from '~/modules/auth/steps/email-field';
import { InlineLinkButton } from '~/modules/common/inline-link-button';
import { WaitlistForm } from '~/modules/requests/waitlist-form';

export function WaitlistStep() {
  const { t } = useTranslation();
  const navigate = useNavigate({ from: '/auth/authenticate' });
  // Once sent, the form's own confirmation stands alone.
  const [sent, setSent] = useState(false);

  const email = useAuthStore((state) => state.email);
  const resetAuthStore = useAuthStore((state) => state.reset);

  // Drops the URL's waitlist flag too, which would reopen this form on reload.
  const signIn = () => {
    resetAuthStore();
    navigate({ search: (prev) => ({ ...prev, waitlist: undefined }), replace: true });
  };

  return (
    <>
      {!sent && (
        <>
          <AuthHeader
            title={t('c:request_access')}
            description={
              <>
                {t('c:have_account')} <InlineLinkButton onClick={signIn}>{t('c:sign_in')}</InlineLinkButton>
              </>
            }
          >
            {email.length > 0 && <AuthEmailButton email={email} onClick={signIn} />}
          </AuthHeader>
          <LegalNotice mode="waitlist" />
        </>
      )}
      <WaitlistForm
        email={email}
        className="flex-col items-stretch"
        inputClassName={authFieldClass}
        buttonSize="block"
        buttonContent={
          <>
            {t('c:request_access')}
            <ArrowRightIcon />
          </>
        }
        callback={() => setSent(true)}
      />
    </>
  );
}
