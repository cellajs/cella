import { useMutation } from '@tanstack/react-query';
import { SmartphoneIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SignInWithTotpData, signInWithTotp } from 'sdk';
import { useNavigateAfterAuth } from '~/modules/auth/post-auth-redirect';
import { TotpConfirmationForm } from '~/modules/auth/totp-confirmation-form';
import { Button } from '~/modules/ui/button';

interface TotpStrategyProps {
  /** The code form shows in place of the button. */
  active: boolean;
  onActiveChange: (active: boolean) => void;
}

export function TotpStrategy({ active, onActiveChange }: TotpStrategyProps) {
  const { t } = useTranslation();
  const navigateAfterAuth = useNavigateAfterAuth();

  const { mutate: totpSignIn, isPending } = useMutation({
    mutationFn: (body: SignInWithTotpData['body']) => signInWithTotp({ body }),
    onSuccess: navigateAfterAuth,
  });

  if (active) return <TotpConfirmationForm onSubmit={totpSignIn} onCancel={() => onActiveChange(false)} loading={isPending} />;

  return (
    <Button onClick={() => onActiveChange(true)} variant="secondary" className="w-full">
      <SmartphoneIcon />
      <span className="truncate">{t('c:authenticator_app.sign_in')}</span>
    </Button>
  );
}
