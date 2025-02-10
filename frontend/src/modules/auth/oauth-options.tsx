import { useSearch } from '@tanstack/react-router';
import { type EnabledOauthProvider, config } from 'config';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { githubSignInUrl, googleSignInUrl, microsoftSignInUrl } from '~/modules/auth/api';
import type { Step } from '~/modules/auth/types';
import { Button } from '~/modules/ui/button';
import { AuthenticateRoute } from '~/routes/auth';
import { useThemeStore } from '~/store/theme';

export const mapOauthProviders = [
  { id: 'github', name: 'Github', url: githubSignInUrl },
  { id: 'google', name: 'Google', url: googleSignInUrl },
  { id: 'microsoft', name: 'Microsoft', url: microsoftSignInUrl },
];
interface OauthOptions {
  id: EnabledOauthProvider;
  name: string;
  url: string;
}

interface OauthOptionsProps {
  actionType: Step;
}

/**
 * Display OAuth options to sign in, sign up, accept invitation
 *
 * @param actionType The action type to perform
 */
const OauthOptions = ({ actionType = 'signIn' }: OauthOptionsProps) => {
  const { t } = useTranslation();
  const { mode } = useThemeStore();
  const { token, redirect } = useSearch({ from: AuthenticateRoute.id });

  const [loading, setLoading] = useState(false);

  const redirectPath = redirect?.startsWith('/') ? redirect : config.defaultRedirectPath;
  const actionText = actionType === 'signIn' ? t('common:sign_in') : actionType === 'signUp' ? t('common:sign_up') : t('common:continue');

  const authenticateWithProvider = async (url: string) => {
    setLoading(true);

    let providerUrl = `${url}?redirect=${redirectPath}`;
    if (token) providerUrl += `&token=${token}`;

    window.location.assign(providerUrl);
  };

  if (config.enabledOauthProviders.length < 1) return null;

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {config.enabledOauthProviders.map((provider) => {
        // Map provider data
        const providerData = mapOauthProviders.find((p) => p.id === provider);
        if (!providerData) return;

        return (
          <Button
            loading={loading}
            key={provider}
            type="button"
            variant="outline"
            className="gap-1"
            onClick={() => authenticateWithProvider(providerData.url)}
          >
            <img
              data-provider={provider}
              src={`/static/images/${provider}-icon.svg`}
              alt={provider}
              className="w-4 h-4 mr-1 data-[provider=github]:group-data-[mode=dark]:invert"
              loading="lazy"
            />
            <span>
              {actionText} {t('common:with').toLowerCase()} {t(providerData.name)}
            </span>
          </Button>
        );
      })}
    </div>
  );
};

export default OauthOptions;
