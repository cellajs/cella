import { useSuspenseQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from 'sdk';
import { AuthEmailButton } from '~/modules/auth/auth-email-button';
import { AuthHeader } from '~/modules/auth/auth-header';
import { useAuthStore } from '~/modules/auth/auth-store';
import { PasskeyStrategy } from '~/modules/auth/passkey-strategy';
import { pendingMfaQueryOptions } from '~/modules/auth/query';
import { TotpStrategy } from '~/modules/auth/totp-strategy';
import { Spinner } from '~/modules/common/spinner';
import { toaster } from '~/modules/common/toaster/toaster';
import { useUserStore } from '~/modules/user/user-store';

export function MfaPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { data: challenge } = useSuspenseQuery(pendingMfaQueryOptions);
  const clearUserStore = useUserStore((state) => state.reset);
  const signedIn = useAuthStore((state) => state.signedIn);

  const [isTotpActive, setIsTotpActive] = useState(false);

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
      <AuthHeader title={t('c:mfa_header')}>
        <AuthEmailButton email={challenge.email} onClick={handleCancelMfa} />
        <p>{t('c:mfa_subheader.text')}</p>
      </AuthHeader>

      {!isTotpActive && <PasskeyStrategy type="mfa" />}
      <TotpStrategy active={isTotpActive} onActiveChange={setIsTotpActive} />
    </>
  );
}
