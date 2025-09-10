import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { Smartphone } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from '~/api.gen';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { useDialoger } from '~/modules/common/dialoger/use-dialoger';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';

export const TOTPStrategy = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const mode = useUIStore((state) => state.mode);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { mutate: totpSignIn } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: (success) => {
      if (success) navigate({ to: appConfig.defaultRedirectPath, replace: true });
      else toaster(t('error:totp_verification_failed'), 'error');
    },
    onError: () => toaster(t('error:totp_verification_failed'), 'error'),
  });

  const openTOTPVerify = () => {
    useDialoger.getState().create(<TotpConfirmationForm onSubmit={totpSignIn} />, {
      id: 'mfa-confirmation',
      triggerRef,
      className: 'sm:max-w-md p-6',
      title: t('common:totp_verify'),
      drawerOnMobile: false,
      hideClose: false,
    });
  };

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Button ref={triggerRef} type="button" onClick={openTOTPVerify} variant="plain" className="w-full gap-1.5 truncate">
        <Smartphone size={16} />
        <span className="truncate">
          {t('common:sign_in')} {t('common:with').toLowerCase()} {t('common:authenticator_app').toLowerCase()}
        </span>
      </Button>
    </div>
  );
};
