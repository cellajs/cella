import { useSearch } from '@tanstack/react-router';
import { appConfig, type EnabledOAuthProvider } from 'config';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AuthStep } from '~/modules/auth/types';
import { toaster } from '~/modules/common/toaster/service';
import { Button } from '~/modules/ui/button';
import { useUIStore } from '~/store/ui';

export const mapOAuthProviders = [
  { id: 'github', name: 'Github' },
  { id: 'google', name: 'Google' },
  { id: 'microsoft', name: 'Microsoft' },
] as const;

type OAuthProvider = (typeof mapOAuthProviders)[number];

/**
 * Display OAuth providers to sign in, sign up, accept invitation
 *
 * @param authStep The action type to perform
 */
const OAuthProviders = ({ authStep = 'signIn' }: { authStep: AuthStep }) => {
  const { t } = useTranslation();
  const mode = useUIStore((state) => state.mode);
  const { token, redirect } = useSearch({ from: '/publicLayout/authLayout/auth/authenticate' });

  const [loadingProvider, setLoadingProvider] = useState<EnabledOAuthProvider | null>(null);

  const redirectPath = redirect?.startsWith('/') ? redirect : appConfig.defaultRedirectPath;
  const actionText = authStep === 'signIn' ? t('common:sign_in') : authStep === 'signUp' ? t('common:sign_up') : t('common:continue');

  const authenticateWithProvider = async (provider: EnabledOAuthProvider) => {
    try {
      setLoadingProvider(provider);

      const baseUrl = `${appConfig.backendAuthUrl}/${provider}`;
      const params = new URLSearchParams();

      params.set('redirect', encodeURIComponent(redirectPath));
      if (token) {
        params.set('token', token);
        params.set('type', 'invite');
      } else {
        params.set('type', 'auth');
        if (authStep === 'signIn') params.set('authFlow', 'signin');
        if (authStep === 'signUp') params.set('authFlow', 'signup');
      }

      const providerUrl = `${baseUrl}?${params.toString()}`;
      window.location.assign(providerUrl);
    } catch (error) {
      toaster(t('common:url_malformed'), 'error');
      setLoadingProvider(null);
    }
  };

  if (appConfig.enabledOAuthProviders.length < 1) return null;

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {appConfig.enabledOAuthProviders.map((provider) => {
        // Map provider data
        const providerData = mapOAuthProviders.find((p): p is OAuthProvider & { id: typeof provider } => p.id === provider);

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

export default OAuthProviders;
