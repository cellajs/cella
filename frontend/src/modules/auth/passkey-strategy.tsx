import { useMutation } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { FingerprintPatternIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type SignInWithPasskeyResponse, signInWithPasskey } from 'sdk';
import { ApiError } from '~/lib/api';
import { getPasskeyVerifyCredential } from '~/modules/auth/passkey-credentials';
import type { PasskeyVerifyType } from '~/modules/auth/types';
import { useNavigateAfterAuth } from '~/modules/auth/use-post-auth-redirect';
import { toaster } from '~/modules/common/toaster/toaster';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

interface PasskeyStrategyProps {
  type: PasskeyVerifyType;
}

export function PasskeyStrategy({ type }: PasskeyStrategyProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const navigateAfterAuth = useNavigateAfterAuth();

  const { mutate: passkeySignIn } = useMutation<SignInWithPasskeyResponse, ApiError | Error, void>({
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

  // The auth backdrop shows through plain's tint, so here the button brings a surface of its own
  return (
    <Button
      type="button"
      variant={type === 'mfa' ? 'default' : 'plain'}
      onClick={() => passkeySignIn()}
      className={cn('w-full gap-1.5', type !== 'mfa' && 'bg-secondary/60 hover:bg-secondary/80')}
    >
      <FingerprintPatternIcon />
      <span className="truncate">
        {t('c:sign_in')} {t('c:with').toLowerCase()} {t('c:passkey').toLowerCase()}
      </span>
    </Button>
  );
}
