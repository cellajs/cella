import { useNavigate } from '@tanstack/react-router';
import { ChevronDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/api.gen';
import PasskeyStrategy from '~/modules/auth/passkey-strategy';
import { useAuthStepsContext } from '~/modules/auth/steps/provider-context';
import { TotpStrategy } from '~/modules/auth/totp-strategy';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';

/**
 * Handles multifactor authentication step in the authentication process.
 */
export const MfaStep = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { email, resetSteps } = useAuthStepsContext();

  const [isActive, setIsActive] = useState(false);

  const handleCancelMfa = async () => {
    try {
      await signOut();
      toaster(t('common:success.cancel_mfa'), 'success');
    } catch (error) {
    } finally {
      resetSteps();
      navigate({ to: '/auth/authenticate', replace: true });
    }
  };

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:mfa_header')}</h1>

      <Button variant="ghost" onClick={handleCancelMfa} className="mx-auto flex max-w-full truncate font-light sm:text-xl bg-foreground/10">
        <span className="truncate">{email}</span>
        <ChevronDown size={16} className="ml-1" />
      </Button>

      <p className="font-light text-center space-x-1">{t('common:mfa_subheader.text')}</p>

      {!isActive && <PasskeyStrategy type="mfa" />}
      <TotpStrategy isActive={isActive} setIsActive={setIsActive} />
    </>
  );
};
