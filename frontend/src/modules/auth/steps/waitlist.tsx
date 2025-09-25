import { ChevronDown, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { LegalNotice } from '~/modules/auth/steps/legal-notice';
import { useAuthStepsContext } from '~/modules/auth/steps/provider-context';
import { WaitlistForm } from '~/modules/requests/waitlist-form';
import { Button } from '~/modules/ui/button';

/**
 * Renders the waitlist request step, including:
 * - Greeting with the user's email and a reset button
 * - Legal notice specific to the waitlist
 * - Waitlist form with a request access button
 */
export const WaitlistStep = () => {
  const { t } = useTranslation();

  const { email, resetSteps } = useAuthStepsContext();

  return (
    <>
      <>
        <div className="text-2xl text-center">
          <h1 className="text-xxl">{t('common:request_access')}</h1>

          <Button variant="ghost" onClick={resetSteps} className="mx-auto flex max-w-full truncate font-light mt-2 sm:text-xl bg-foreground/10">
            <span className="truncate">{email}</span>
            <ChevronDown size={16} className="ml-1" />
          </Button>
        </div>
        <LegalNotice email={email} mode="waitlist" />
      </>
      <WaitlistForm
        email={email}
        buttonContent={
          <>
            <Lock size={16} className="mr-2" />
            <span className="text-base">{t('common:request_access')}</span>
          </>
        }
      />
    </>
  );
};
