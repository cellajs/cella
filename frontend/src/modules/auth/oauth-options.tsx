import { useSearch } from '@tanstack/react-router';
import { appConfig, type EnabledOauthProvider } from 'config';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Step } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { AuthenticateRoute } from '~/routes/auth';
import { useUIStore } from '~/store/ui';

export const mapOauthProviders = [
  { id: 'github', name: 'Github' },
  { id: 'google', name: 'Google' },
  { id: 'microsoft', name: 'Microsoft' },
] as const;

type OauthProviders = (typeof mapOauthProviders)[number];

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
  const mode = useUIStore((state) => state.mode);
  const { token, redirect } = useSearch({ from: AuthenticateRoute.id });

  const [loadingProvider, setLoadingProvider] = useState<EnabledOauthProvider | null>(null);

  const redirectPath = redirect?.startsWith('/') ? redirect : '';
  const actionText = actionType === 'signIn' ? t('common:sign_in') : actionType === 'signUp' ? t('common:sign_up') : t('common:continue');

  const authenticateWithProvider = async (provider: EnabledOauthProvider) => {
    try {
      setLoadingProvider(provider);

      const baseUrl = `${appConfig.backendAuthUrl}/${provider}`;
      const params = new URLSearchParams();

      params.set('redirect', redirectPath);
      if (token) {
        params.set('token', token);
        params.set('type', 'invite');
      } else params.set('type', 'auth');

      const providerUrl = `${baseUrl}?${params.toString()}`;
      window.location.assign(providerUrl);
    } catch (error) {
      toaster(t('common:url_malformed'), 'error');
      setLoadingProvider(null);
    }
  };

  if (appConfig.enabledOauthProviders.length < 1) return null;

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {appConfig.enabledOauthProviders.map((provider) => {
        // Map provider data
        const providerData = mapOauthProviders.find((p): p is OauthProviders & { id: typeof provider } => p.id === provider);

        if (!providerData) return null;

        return (
          <Button
            loading={loadingProvider === provider}
            key={provider}
            type="button"
            variant="outline"
            className="gap-1"
            onClick={() => authenticateWithProvider(providerData.id)}
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
