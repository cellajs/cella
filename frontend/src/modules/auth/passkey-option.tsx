import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { Fingerprint } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { type ApiError, getPasskeyChallenge, signInWithPasskey, type SignInWithPasskeyData, type SignInWithPasskeyResponse } from '~/api.gen';
import type { AuthStep } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { AuthenticateRoute } from '~/routes/auth';
import { useUIStore } from '~/store/ui';

interface PasskeyOptionProps {
  actionType: AuthStep;
  email: string;
}

const PasskeyOption = ({ email, actionType = 'signIn' }: PasskeyOptionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = useUIStore((state) => state.mode);

  const { redirect } = useSearch({ from: AuthenticateRoute.id });
  const redirectPath = redirect?.startsWith('/') ? redirect : appConfig.defaultRedirectPath;

  const { mutate: passkeyAuth } = useMutation<SignInWithPasskeyResponse, ApiError | Error, NonNullable<SignInWithPasskeyData['body']>['userEmail']>({
    mutationFn: async (userEmail) => {
      //  Fetch a challenge from BE
      const { challengeBase64 } = await getPasskeyChallenge();

      // Decode  challenge and wrap it in a Uint8Array (required format)
      const raw = decodeBase64(challengeBase64);
      const challenge = new Uint8Array(raw);

      // Prompt user to authenticate with a passkey
      const credential = await navigator.credentials.get({ publicKey: { challenge, userVerification: 'required' } });

      // Ensure response is a PublicKeyCredential
      if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create public key');

      const { response } = credential;

      // Ensure authenticator response is valid
      if (!(response instanceof AuthenticatorAssertionResponse)) throw new Error('Unexpected response type');

      // Encode all binary responses into Base64 and prepare body for BE
      const body = {
        clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
        authenticatorData: encodeBase64(new Uint8Array(response.authenticatorData)),
        signature: encodeBase64(new Uint8Array(response.signature)),
        userEmail,
      };

      // Send signed response to BE to complete authentication
      return await signInWithPasskey({ body });
    },
    onSuccess: (success) => {
      if (success) navigate({ to: redirectPath, replace: true });
      else toaster(t('error:passkey_sign_in'), 'error');
    },
    onError: () => toaster(t('error:passkey_sign_in'), 'error'),
  });

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Button type="button" onClick={() => passkeyAuth(email)} variant="plain" className="w-full gap-1.5">
        <Fingerprint size={16} />
        <span>
          {actionType === 'signIn' ? t('common:sign_in') : t('common:sign_up')} {t('common:with').toLowerCase()} {t('common:passkey').toLowerCase()}
        </span>
      </Button>
    </div>
  );
};

export default PasskeyOption;
