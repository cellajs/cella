import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { type SignInWithPasskeyResponse, signInWithPasskey } from 'sdk';
import { ApiError } from '~/lib/api';
import { getPasskeyVerifyCredential } from '~/modules/auth/passkey-credentials';
import { useNavigateAfterAuth } from '~/modules/auth/post-auth-redirect';
import type { PasskeyVerifyKind } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster/toaster';

export function usePasskeySignIn(kind: PasskeyVerifyKind) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const navigateAfterAuth = useNavigateAfterAuth();

  const { mutate } = useMutation<SignInWithPasskeyResponse, ApiError | Error>({
    mutationFn: async () => {
      const body = await getPasskeyVerifyCredential({ kind });
      return await signInWithPasskey({ body });
    },
    onSuccess: navigateAfterAuth,
    onError: (error) => {
      if (kind === 'mfa' && error instanceof ApiError) navigate({ to: '/error', search: { error: error.type, severity: error.severity } });
      // A refusal by the server is toasted by the global handler; the browser's own failure (a cancelled prompt) is not
      if (kind === 'authentication' && !(error instanceof ApiError)) toaster.error(t('error:passkey_verification_failed'));
    },
  });

  return () => mutate();
}
