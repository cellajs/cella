import { ArrowRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { WaitlistForm } from '~/modules/requests/waitlist-form';

export function WaitlistStep() {
  const { t } = useTranslation();

  const email = useAuthStore((state) => state.email);
  const resetAuthStore = useAuthStore((state) => state.reset);

  return (
    <>
      <AuthHeader title={t('c:request_access')}>{email.length > 0 && <AuthEmailButton email={email} onClick={resetAuthStore} />}</AuthHeader>
      <LegalNotice mode="waitlist" />
      {/* Stacked like the email step; the form's own row layout serves the pricing dialog */}
      <WaitlistForm
        email={email}
        className="flex-col items-stretch"
        inputClassName="h-12"
        buttonContent={
          <>
            {t('c:request_access')}
            <ArrowRightIcon />
          </>
        }
      />
    </>
  );
}
