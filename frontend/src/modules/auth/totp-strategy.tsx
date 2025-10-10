import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { appConfig } from 'config';
import { SmartphoneIcon } from 'lucide-react';
import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from '~/api.gen';
import { TotpConfirmationForm } from '~/modules/auth/totp-verify-code-form';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';

export const TotpStrategy = ({ isActive, setIsActive }: { isActive: boolean; setIsActive: (active: boolean) => void }) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const mode = useUIStore((state) => state.mode);

  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const { mutate: totpSignIn } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: () => {
      navigate({ to: appConfig.defaultRedirectPath, replace: true });
    },
    onError: () => toaster(t('error:totp_verification_failed'), 'error'),
  });

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {!isActive && (
        <Button ref={triggerRef} type="button" onClick={() => setIsActive(true)} variant="plain" className="w-full gap-1.5 truncate">
          <SmartphoneIcon size={16} />
          <span className="truncate">
            {t('common:sign_in')} {t('common:with').toLowerCase()} {t('common:authenticator_app').toLowerCase()}
          </span>
        </Button>
      )}

      {isActive && <TotpConfirmationForm onSubmit={totpSignIn} onCancel={() => setIsActive(false)} label={t('common:totp_verify')} />}
    </div>
  );
};
