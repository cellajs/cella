import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FingerprintPatternIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SignInWithPasskeyResponse, signInWithPasskey } from 'sdk';
import { ApiError } from '~/lib/api';
import { getPasskeyVerifyCredential } from '~/modules/auth/passkey-credentials';
import { useNavigateAfterAuth } from '~/modules/auth/post-auth-redirect';
import type { PasskeyVerifyType } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';

interface PasskeyStrategyProps {
  type: PasskeyVerifyType;
}

export function PasskeyStrategy({ type }: PasskeyStrategyProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const navigateAfterAuth = useNavigateAfterAuth();

  const { mutate: passkeySignIn } = useMutation<SignInWithPasskeyResponse, ApiError | Error>({
    mutationFn: async () => {
      const body = await getPasskeyVerifyCredential({ type });
      return await signInWithPasskey({ body });
    },
    onSuccess: navigateAfterAuth,
    onError: (error) => {
      if (type === 'mfa' && error instanceof ApiError) {
        navigate({ to: '/error', search: { error: error.type, severity: error.severity } });
      }
      // A refusal by the server is toasted by the global handler; the browser's own failure (a cancelled prompt) is not
      if (type === 'authentication' && !(error instanceof ApiError)) toaster.error(t('error:passkey_verification_failed'));
    },
  });

  return (
    <Button variant={type === 'mfa' ? 'default' : 'plain'} onClick={() => passkeySignIn()} className="w-full">
      <FingerprintPatternIcon />
      <span className="truncate">{t('c:passkey.sign_in')}</span>
    </Button>
  );
}
