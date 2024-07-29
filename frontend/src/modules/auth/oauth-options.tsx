import { useParams, useSearch, useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { useState, useEffect } from 'react';
import { KeySquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { githubSignInUrl, googleSignInUrl, microsoftSignInUrl, authThroughPasskey, getChallenge, checkUserPasskey } from '~/api/auth';
import { acceptInvite } from '~/api/general';
import { Button } from '~/modules/ui/button';
import { SignInRoute } from '~/routes/authentication';
import { useThemeStore } from '~/store/theme';
import type { Step } from '.';
import { arrayBufferToBase64Url, base64UrlDecode } from '~/lib/utils';

export type OauthProviderOptions = (typeof config.oauthProviderOptions)[number];

type OauthProvider = {
  id: OauthProviderOptions;
  name: string;
  url: string;
};

export const oauthProviders: OauthProvider[] = [
  { id: 'github', name: 'Github', url: githubSignInUrl },
  { id: 'google', name: 'Google', url: googleSignInUrl },
  { id: 'microsoft', name: 'Microsoft', url: microsoftSignInUrl },
];

interface OauthOptionsProps {
  actionType: Step;
  email: string;
}

const OauthOptions = ({ email, actionType = 'signIn' }: OauthOptionsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode } = useThemeStore();
  const { token }: { token: string } = useParams({ strict: false });

  const [loading, setLoading] = useState(false);
  const [hasPasskey, setHasPasskey] = useState(false);

  async function passkeyAuth() {
    const { challengeBase64 } = await getChallenge();

    const credential = await navigator.credentials.get({
      publicKey: {
        challenge: base64UrlDecode(challengeBase64),
        userVerification: 'required',
      },
    });

    if (!(credential instanceof PublicKeyCredential)) throw new Error('Failed to get credential');
    const response = credential.response;
    if (!(response instanceof AuthenticatorAssertionResponse)) throw new Error('Unexpected response type');

    const credentialData = {
      credentialId: credential.id,
      authenticatorData: arrayBufferToBase64Url(response.authenticatorData),
      clientDataJSON: arrayBufferToBase64Url(response.clientDataJSON),
      signature: arrayBufferToBase64Url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64Url(response.userHandle) : null,
      email,
    };

    const success = await authThroughPasskey(credentialData);
    if (success) navigate({ to: config.defaultRedirectPath, replace: true });
  }

  const invertClass = mode === 'dark' ? 'invert' : '';
  let redirect = '';
  if (token) {
    const searchResult = useSearch({
      from: SignInRoute.id,
    });
    redirect = searchResult.redirect ?? '';
  }

  const redirectQuery = redirect ? `?redirect=${redirect}` : '';

  useEffect(() => {
    if (!email.length) return;
    (async () => {
      setHasPasskey(await checkUserPasskey(email));
    })();
  }, [email]);

  return (
    <>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="text-muted-foreground px-2">{t('common:or')}</span>
      </div>

      <div className="flex flex-col space-y-2">
        {hasPasskey && (
          <Button type="button" onClick={passkeyAuth} variant="outline" className="w-full gap-1.5">
            <KeySquare size={16} />
            {t('common:passkey_sign_in')}
          </Button>
        )}
        {config.enabledOauthProviders.map((id) => {
          const option = oauthProviders.find((provider) => provider.id === id);
          if (!option) return;

          return (
            <Button
              loading={loading}
              key={option.name}
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setLoading(true);
                if (token) {
                  acceptInvite({ token, oauth: option.id }).then(() => {
                    window.location.href = config.defaultRedirectPath;
                  });
                } else {
                  window.location.href = option.url + redirectQuery;
                }
              }}
            >
              <img
                src={`/static/images/${option.name.toLowerCase()}-icon.svg`}
                alt={option.name}
                className={`w-4 h-4 ${option.id === 'github' ? invertClass : ''}`}
                loading="lazy"
              />
              {token ? t('common:accept') : actionType === 'signUp' ? t('common:sign_up') : t('common:sign_in')} with {option.name}
            </Button>
          );
        })}
      </div>
    </>
  );
};

export default OauthOptions;
