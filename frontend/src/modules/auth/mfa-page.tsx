import * as Sentry from '@sentry/react';
import { useNavigate } from '@tanstack/react-router';
import { ChevronDownIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/api.gen';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { TotpStrategy } from '~/modules/auth/totp-strategy';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';
import { useAuthStore } from '~/store/auth';
import { useUserStore } from '~/store/user';

/**
 * Handles multifactor authentication in the authentication flows.
 */
export function MfaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { lastUser, clearUserStore } = useUserStore();
  const signedIn = useAuthStore((state) => state.signedIn);

  const [isActive, setIsActive] = useState(false);

  const handleCancelMfa = async () => {
    try {
      await signOut();
      toaster(t('common:success.cancel_mfa'), 'success');
    } catch (error) {
      Sentry.captureException(error);
      console.error('Failed to retrieve data:', error);
    } finally {
      clearUserStore();
      navigate({ to: '/auth/authenticate', replace: true });
    }
  };

  // Show spinner after successful MFA to prevent UI flash during route transition
  if (signedIn) return <Spinner className="h-10 w-10" />;

  // If somehow undefined return to authenticate
  if (!lastUser?.email) {
    navigate({ to: '/auth/authenticate', replace: true });
    return <></>;
  }

  return (
    <>
      <h1 className="text-2xl text-center">{t('common:mfa_header')}</h1>

      <Button
        variant="ghost"
        onClick={handleCancelMfa}
        className="mx-auto flex max-w-full truncate font-light sm:text-xl bg-foreground/10"
      >
        <span className="truncate">{lastUser.email}</span>
        <ChevronDownIcon size={16} className="ml-1" />
      </Button>

      <p className="font-light text-center space-x-1">{t('common:mfa_subheader.text')}</p>

      {!isActive && <PasskeyStrategy type="mfa" />}
      <TotpStrategy isActive={isActive} setIsActive={setIsActive} />
    </>
  );
}
