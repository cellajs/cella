import { useNavigate, useSearch } from '@tanstack/react-router';
import { type EnabledOauthProvider, config } from 'config';
import { Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { githubSignInUrl, googleSignInUrl, microsoftSignInUrl } from '~/modules/auth/api';
import type { Step } from '~/modules/auth/types';
import { Button } from '~/modules/ui/button';
import { passkeyAuth } from '~/modules/users/helpers';
import { AuthenticateRoute } from '~/routes/auth';
import { useThemeStore } from '~/store/theme';

export const mapOauthProviders = [
  { id: 'github', name: 'Github', url: githubSignInUrl },
  { id: 'google', name: 'Google', url: googleSignInUrl },
  { id: 'microsoft', name: 'Microsoft', url: microsoftSignInUrl },
];

const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;

interface OauthOptions {
  id: EnabledOauthProvider;
  name: string;
  url: string;
}

interface OauthOptionsProps {
  actionType: Step;
  email: string;
  showPasskey?: boolean;
}

// TODO: split passkeyAuth into separate file
const OauthOptions = ({ email, actionType = 'signIn', showPasskey = false }: OauthOptionsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode } = useThemeStore();
  const { token, redirect } = useSearch({ from: AuthenticateRoute.id });

  const [loading, setLoading] = useState(false);

  const redirectPath = redirect ?? config.defaultRedirectPath;

  const successCallback = () => {
    navigate({ to: redirectPath, replace: true });
  };

  const authenticateWithProvider = async (provider: EnabledOauthProvider) => {
    setLoading(true);

    // Map provider data
    const providerData = mapOauthProviders.find((p) => p.id === provider);
    if (!providerData) return;

    let providerUrl = `${providerData.url}?redirect=${redirectPath}`;
    if (token) providerUrl += `&token=${token}`;

    window.location.assign(providerUrl);
  };

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {showPasskey && (
        <Button type="button" onClick={() => passkeyAuth(email, successCallback)} variant="plain" className="w-full gap-1.5">
          <Fingerprint size={16} />
          {t('common:passkey_sign_in')}
        </Button>
      )}
      {enabledStrategies.includes('oauth') &&
        config.enabledOauthProviders.map((provider) => {
          return (
            <Button
              loading={loading}
              key={provider}
              type="button"
              variant="outline"
              className="gap-1"
              onClick={() => authenticateWithProvider(provider)}
            >
              <img
                data-provider={provider}
                src={`/static/images/${provider.toLowerCase()}-icon.svg`}
                alt={provider}
                className="w-4 h-4 mr-1 group-data-[mode=dark]:data-[provider=github]:invert"
                loading="lazy"
              />
              <span>{actionType === 'signIn' ? t('common:sign_in') : t('common:sign_up')}</span>
              <span>{t('common:with').toLowerCase()}</span> <span className="capitalize">{provider}</span>
            </Button>
          );
        })}
    </div>
  );
};

export default OauthOptions;
