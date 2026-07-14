import { ArrowRightIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { useAuthStore } from '~/modules/auth/auth-store';
import { LegalNotice } from '~/modules/auth/legal-notice';
import { WaitlistForm } from '~/modules/requests/waitlist-form';

/**
 * Renders the waitlist request step, including:
 * - Greeting with the user's email and a reset button
 * - Legal notice specific to the waitlist
 * - Waitlist form with a request access button
 */
export function WaitlistStep() {
  const { t } = useTranslation();

  const { email, resetSteps } = useAuthStore();

  return (
    <>
      <div className="text-center text-2xl">
        <h1 className="text-xxl">{t('c:request_access')}</h1>
        {email.length > 0 && <AuthEmailButton email={email} onClick={resetSteps} className="mt-2" />}
      </div>
      <LegalNotice email={email} mode="waitlist" />
      <WaitlistForm
        email={email}
        buttonContent={
          <>
            <span className="text-base">{t('c:request_access')}</span>
            <ArrowRightIcon className="ml-2" />
          </>
        }
      />
    </>
  );
}
