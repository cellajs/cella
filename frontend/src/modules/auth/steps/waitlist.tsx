import { ArrowRightIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AuthEmailButton, AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { authFieldClass } from '~/modules/auth/steps/email-field';
import { WaitlistForm } from '~/modules/requests/waitlist-form';

export function WaitlistStep() {
  const { t } = useTranslation();
  // Once sent, the form's own confirmation stands alone.
  const [sent, setSent] = useState(false);

  const email = useAuthStore((state) => state.email);
  const resetAuthStore = useAuthStore((state) => state.reset);

  return (
    <>
      {!sent && (
        <>
          <AuthHeader title={t('c:request_access')}>{email.length > 0 && <AuthEmailButton email={email} onClick={resetAuthStore} />}</AuthHeader>
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
