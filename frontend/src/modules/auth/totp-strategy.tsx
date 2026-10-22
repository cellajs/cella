import { useMutation } from '@tanstack/react-query';
import { SmartphoneIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from 'sdk';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useNavigateAfterAuth } from '~/modules/auth/use-post-auth-redirect';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';

export function TotpStrategy({ isActive, setIsActive }: { isActive: boolean; setIsActive: (active: boolean) => void }) {
  const { t } = useTranslation();
  const navigateAfterAuth = useNavigateAfterAuth();

  const mode = useUIStore((state) => state.mode);

  const { mutate: totpSignIn, isPending } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: navigateAfterAuth,
  });

  return (
    <div data-mode={mode} className="group flex flex-col gap-2">
      {!isActive && (
        <Button type="button" onClick={() => setIsActive(true)} variant="plain" className="w-full gap-1.5 truncate">
          <SmartphoneIcon />
          <span className="truncate">
            {t('c:sign_in')} {t('c:with').toLowerCase()} {t('c:authenticator_app').toLowerCase()}
          </span>
        </Button>
      )}

      {isActive && (
        <TotpConfirmationForm onSubmit={totpSignIn} onCancel={() => setIsActive(false)} label={t('c:totp_verify')} isPending={isPending} />
      )}
    </div>
  );
}
