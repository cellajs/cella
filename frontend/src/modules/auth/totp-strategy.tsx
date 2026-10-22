import { useMutation } from '@tanstack/react-query';
import { SmartphoneIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ApiError, type SignInWithTotpData, type SignInWithTotpResponse, signInWithTotp } from 'sdk';
import { TotpConfirmationForm } from '~/modules/auth/totp-confirmation-form';
import { useNavigateAfterAuth } from '~/modules/auth/use-post-auth-redirect';
import { Button } from '~/modules/ui/button';

interface TotpStrategyProps {
  /** The code form shows in place of the button. */
  active: boolean;
  onActiveChange: (active: boolean) => void;
}

export function TotpStrategy({ active, onActiveChange }: TotpStrategyProps) {
  const { t } = useTranslation();
  const navigateAfterAuth = useNavigateAfterAuth();

  const { mutate: totpSignIn, isPending } = useMutation<SignInWithTotpResponse, ApiError | Error, NonNullable<SignInWithTotpData['body']>>({
    mutationFn: async (body) => await signInWithTotp({ body }),
    onSuccess: navigateAfterAuth,
  });

  if (active) return <TotpConfirmationForm onSubmit={totpSignIn} onCancel={() => onActiveChange(false)} loading={isPending} />;

  return (
    <Button type="button" onClick={() => onActiveChange(true)} variant="plain" className="w-full gap-1.5">
      <SmartphoneIcon />
      <span className="truncate">
        {t('c:sign_in')} {t('c:with').toLowerCase()} {t('c:authenticator_app').toLowerCase()}
      </span>
    </Button>
  );
}
