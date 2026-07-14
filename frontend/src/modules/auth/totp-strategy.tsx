import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { SmartphoneIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from 'sdk';
import { appConfig } from 'shared';
import { useAuthStore } from '~/modules/auth/auth-store';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';

export const TotpStrategy = ({
  isActive,
  setIsActive,
}: {
  isActive: boolean;
  setIsActive: (active: boolean) => void;
}) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const mode = useUIStore((state) => state.mode);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { mutate: totpSignIn } = useMutation<
    SignInWithTotpResponse,
    ApiError | Error,
    NonNullable<SignInWithTotpData['body']>
  >({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: () => {
      useAuthStore.getState().setSignedIn(true);
      navigate({ to: appConfig.defaultRedirectPath, replace: true });
    },
    onError: () => toaster(t('error:totp_verification_failed'), 'error'),
  });

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {!isActive && (
        <Button
          ref={triggerRef}
          type="button"
          onClick={() => setIsActive(true)}
          variant="plain"
          className="w-full gap-1.5 truncate"
        >
          <SmartphoneIcon />
          <span className="truncate">
            {t('c:sign_in')} {t('c:with').toLowerCase()} {t('c:authenticator_app').toLowerCase()}
          </span>
        </Button>
      )}

      {isActive && (
        <TotpConfirmationForm onSubmit={totpSignIn} onCancel={() => setIsActive(false)} label={t('c:totp_verify')} />
      )}
    </div>
  );
};
