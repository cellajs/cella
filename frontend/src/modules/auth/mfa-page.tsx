import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FingerprintPatternIcon, SmartphoneIcon } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from 'sdk';
import { AuthAlternatives } from '~/modules/auth/auth-alternatives';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { usePasskeySignIn } from '~/modules/auth/passkey-strategy';
import { pendingMfaQueryOptions } from '~/modules/auth/query';
import { TotpSignInForm } from '~/modules/auth/totp-strategy';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

export function MfaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: challenge } = useSuspenseQuery(pendingMfaQueryOptions);
  const clearUserStore = useUserStore((state) => state.reset);
  const signedIn = useAuthStore((state) => state.signedIn);

  const [isTotpActive, setIsTotpActive] = useState(false);
  const passkeySignIn = usePasskeySignIn('mfa');

  const handleCancelMfa = async () => {
    await signOut().then(
      () => toaster.success(t('c:success.cancel_mfa')),
      (error) => console.error('Sign out failed:', error),
    );
    clearUserStore();
    navigate({ to: '/auth/authenticate', replace: true });
  };

  if (signedIn) return <Spinner size="lg" />;

  return (
    <>
      <AuthHeader title={t('c:mfa')} description={t('c:mfa_step.text')}>
        <AuthEmailButton email={challenge.email} onClick={handleCancelMfa} />
      </AuthHeader>

      {isTotpActive ? (
        <TotpSignInForm onCancel={() => setIsTotpActive(false)} />
      ) : (
        <>
          <Button size="block" onClick={passkeySignIn}>
            <FingerprintPatternIcon />
            <span className="truncate">{t('c:passkey.sign_in')}</span>
          </Button>
          <AuthAlternatives
            authStep="signIn"
            items={[{ id: 'totp', icon: SmartphoneIcon, label: t('c:authenticator_app.sign_in'), onClick: () => setIsTotpActive(true) }]}
          />
        </>
      )}
    </>
  );
}
