import { decodeBase64, encodeBase64 } from '@oslojs/encoding';
import { useMutation } from '@tanstack/react-query';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { appConfig } from 'config';
import { Fingerprint } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  type GetPasskeyChallengeData,
  getPasskeyChallenge,
  type SignInWithPasskeyData,
  type SignInWithPasskeyResponse,
  signInWithPasskey,
} from '~/api.gen';
import { ApiError } from '~/lib/api';
import type { BaseOptionsProps } from '~/modules/auth/steps';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';

interface PasskeyOptionProps extends BaseOptionsProps {
  email?: string;
  type: Exclude<GetPasskeyChallengeData['query']['type'], 'registrate'>;
}

const PasskeyOption = ({ email, type, authStep = 'signIn' }: PasskeyOptionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const mode = useUIStore((state) => state.mode);

  const { redirect } = useSearch({ strict: false });
  const redirectPath = redirect?.startsWith('/') ? redirect : appConfig.defaultRedirectPath;

  const { mutate: passkeyAuth } = useMutation<SignInWithPasskeyResponse, ApiError | Error, NonNullable<SignInWithPasskeyData['body']>['email']>({
    mutationFn: async (email) => {
      //  Fetch a challenge from BE
      const { challengeBase64, credentialIds } = await getPasskeyChallenge({ query: { email, type } });

      // Decode  challenge and wrap it in a Uint8Array (required format)
      const raw = decodeBase64(challengeBase64);
      const challenge = new Uint8Array(raw);

      // Prepare allowCredentials for passkey request
      const allowCredentials = credentialIds.map((id: string) => ({
        id: new Uint8Array(decodeBase64(id)),
        type: 'public-key' as const,
        transports: ['internal'] as AuthenticatorTransport[],
      }));

      // Prompt user to authenticate with a passkey
      const credential = await navigator.credentials.get({ publicKey: { challenge, allowCredentials, userVerification: 'required' } });

      // Ensure response is a PublicKeyCredential
      if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to create public key');

      const { response, rawId } = credential;

      // Ensure authenticator response is valid
      if (!(response instanceof AuthenticatorAssertionResponse)) throw new Error('Unexpected response type');

      // Encode all binary responses into Base64 and prepare body for BE
      const body = {
        credentialId: encodeBase64(new Uint8Array(rawId)),
        clientDataJSON: encodeBase64(new Uint8Array(response.clientDataJSON)),
        authenticatorData: encodeBase64(new Uint8Array(response.authenticatorData)),
        signature: encodeBase64(new Uint8Array(response.signature)),
        email,
        type: type,
      };

      // Send signed response to BE to complete authentication
      return await signInWithPasskey({ body });
    },
    onSuccess: (success) => {
      if (success) navigate({ to: redirectPath, replace: true });
      else toaster(t('error:passkey_verification_failed'), 'error');
    },
    onError: (error) => {
      if (type === 'two_factor' && error instanceof ApiError) {
        navigate({ to: '/error', search: { error: error.type, severity: error.severity } });
      }
      if (type === 'login') toaster(t('error:passkey_verification_failed'), 'error');
    },
  });

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      <Button type="button" onClick={() => passkeyAuth(email)} variant="plain" className="w-full gap-1.5">
        <Fingerprint size={16} />
        <span>
          {authStep === 'signIn' ? t('common:sign_in') : t('common:sign_up')} {t('common:with').toLowerCase()} {t('common:passkey').toLowerCase()}
        </span>
      </Button>
    </div>
  );
};

export default PasskeyOption;
