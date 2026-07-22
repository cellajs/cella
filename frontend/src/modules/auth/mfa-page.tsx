import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from 'sdk';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { useAuthStore } from '~/modules/auth/auth-store';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { TotpStrategy } from '~/modules/auth/totp-strategy';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore } from '~/modules/user/user-store';

/**
 * Handles multifactor authentication in the authentication flows.
 */
export function MfaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { lastUser, reset: clearUserStore } = useUserStore();
  const signedIn = useAuthStore((state) => state.signedIn);

  const [isActive, setIsActive] = useState(false);

  const handleCancelMfa = async () => {
    try {
      await signOut();
      toaster.success(t('c:success.cancel_mfa'));
    } catch (error) {
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
    return null;
  }

  return (
    <>
      <h1 className="text-center text-2xl">{t('c:mfa_header')}</h1>

      <AuthEmailButton email={lastUser.email} onClick={handleCancelMfa} />

      <p className="space-x-1 text-center">{t('c:mfa_subheader.text')}</p>

      {!isActive && <PasskeyStrategy type="mfa" />}
      <TotpStrategy isActive={isActive} setIsActive={setIsActive} />
    </>
  );
}
