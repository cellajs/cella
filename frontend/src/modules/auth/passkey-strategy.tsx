import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { FingerprintIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { type SignInWithPasskeyData, type SignInWithPasskeyResponse, signInWithPasskey } from '~/api.gen';
import { ApiError } from '~/lib/api';
import { getPasskeyVerifyCredential } from '~/modules/auth/passkey-credentials';
import type { PasskeyCredentialProps } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';

import { useUIStore } from '~/store/ui';

export function PasskeyStrategy({
  email,
  type,
}: Omit<PasskeyCredentialProps, 'type'> & {
  type: Exclude<PasskeyCredentialProps['type'], 'registration'>;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = useUIStore((state) => state.mode);

  const { redirect } = useSearch({ strict: false });
  const redirectPath = redirect?.startsWith('/') ? redirect : appConfig.defaultRedirectPath;

  const { mutate: passkeyAuth } = useMutation<
    SignInWithPasskeyResponse,
    ApiError | Error,
    NonNullable<SignInWithPasskeyData['body']>['email']
  >({
    mutationFn: async (email) => {
      const body = await getPasskeyVerifyCredential({ email, type });
      // Send signed response to BE to complete authentication
      return await signInWithPasskey({ body });
    },
    onSuccess: () => {
      navigate({ to: redirectPath, replace: true });
    },
    onError: (error) => {
      if (type === 'mfa' && error instanceof ApiError) {
        navigate({ to: '/error', search: { error: error.type, severity: error.severity } });
      }
      if (type === 'authentication') toaster(t('error:passkey_verification_failed'), 'error');
    },
  });

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Button
        type="button"
        variant={type === 'mfa' ? 'default' : 'outline'}
        onClick={() => passkeyAuth(email)}
        className="w-full gap-1.5 truncate"
      >
        <FingerprintIcon size={16} />
        <span className="truncate">
          {t('common:sign_in')} {t('common:with').toLowerCase()} {t('common:passkey').toLowerCase()}
        </span>
      </Button>
    </div>
  );
}
