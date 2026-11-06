import { useMutation } from '@tanstack/react-query';
import { type SignInWithTotpData, signInWithTotp } from 'sdk';
import { useNavigateAfterAuth } from '~/modules/auth/post-auth-redirect';
import { TotpConfirmationForm } from '~/modules/auth/totp-confirmation-form';

interface TotpSignInFormProps {
  onCancel: () => void;
}

export function TotpSignInForm({ onCancel }: TotpSignInFormProps) {
  const navigateAfterAuth = useNavigateAfterAuth();

  const { mutate: totpSignIn, isPending } = useMutation({
    mutationFn: (body: SignInWithTotpData['body']) => signInWithTotp({ body }),
    onSuccess: navigateAfterAuth,
  });

  return <TotpConfirmationForm onSubmit={totpSignIn} onCancel={onCancel} loading={isPending} size="block" cancelVariant="glass" />;
}
