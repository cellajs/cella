import { useMutation } from '@tanstack/react-query';
import { SmartphoneIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from 'sdk';
import { TotpConfirmationForm } from '~/modules/auth/totp-confirmation-form';
import { useNavigateAfterAuth } from '~/modules/auth/use-post-auth-redirect';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/modules/ui/ui-store';

interface TotpStrategyProps {
  /** The code form shows in place of the button. */
  active: boolean;
  onActiveChange: (active: boolean) => void;
}

export function TotpStrategy({ active, onActiveChange }: TotpStrategyProps) {
  const { t } = useTranslation();
  const navigateAfterAuth = useNavigateAfterAuth();

  const mode = useUIStore((state) => state.mode);

  const { mutate: totpSignIn, isPending } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: navigateAfterAuth,
  });

  return (
    <div data-mode={mode} className="group flex flex-col gap-2">
      {!active && (
        <Button type="button" onClick={() => onActiveChange(true)} variant="plain" className="w-full gap-1.5 truncate">
          <SmartphoneIcon />
          <span className="truncate">
            {t('c:sign_in')} {t('c:with').toLowerCase()} {t('c:authenticator_app').toLowerCase()}
          </span>
        </Button>
      )}

      {active && <TotpConfirmationForm onSubmit={totpSignIn} onCancel={() => onActiveChange(false)} loading={isPending} />}
    </div>
  );
}
