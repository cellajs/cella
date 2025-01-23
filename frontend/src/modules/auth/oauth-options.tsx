import { useNavigate, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { githubSignInUrl, googleSignInUrl, microsoftSignInUrl } from '~/modules/auth/api';
import { acceptInvite } from '~/modules/auth/api';
import type { Step } from '~/modules/auth/auth-steps';
import { Button } from '~/modules/ui/button';
import { passkeyAuth } from '~/modules/users/helpers';
import { AuthenticateRoute } from '~/routes/auth';
import { useThemeStore } from '~/store/theme';
import type { EnabledOauthProvider } from '~/types/common';

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

const OauthOptions = ({ email, actionType = 'signIn', showPasskey = false }: OauthOptionsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode } = useThemeStore();
  const { token } = useSearch({
    from: AuthenticateRoute.id,
  });

  const [loading, setLoading] = useState(false);

  const searchResult = useSearch({
    from: AuthenticateRoute.id,
  });
  const redirectPath = searchResult.redirect ?? config.defaultRedirectPath;

  const successesCallback = () => {
    navigate({ to: redirectPath, replace: true });
  };

  const navigateToUrl = (path: string) => window.location.assign(path); // for better history handling

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {showPasskey && (
        <Button type="button" onClick={() => passkeyAuth(email, successesCallback)} variant="plain" className="w-full gap-1.5">
          <Fingerprint size={16} />
          {t('common:passkey_sign_in')}
        </Button>
      )}
      {enabledStrategies.includes('oauth') &&
        config.enabledOauthProviders.map((provider) => {
          // Map the provider data
          const providerData = mapOauthProviders.find((p) => p.id === provider);
          if (!providerData) return;

          const relocatePath = `${providerData.url}?redirect=${redirectPath}`;
          return (
            <Button
              loading={loading}
              key={provider}
              type="button"
              variant="outline"
              className="gap-1"
              onClick={() => {
                setLoading(true);
                if (token) {
                  acceptInvite({ token, oauth: provider }).then(() => navigateToUrl(relocatePath));
                } else navigateToUrl(relocatePath);
              }}
            >
              <img
                data-provider={provider}
                src={`/static/images/${provider.toLowerCase()}-icon.svg`}
                alt={provider}
                className="w-4 h-4 mr-1 group-data-[mode=dark]:data-[provider=github]:invert"
                loading="lazy"
              />
              <span>{actionType === 'signIn' ? t('common:sign_in') : t('common:sign_up')}</span>
              <span>{t('common:with').toLowerCase()}</span> <span>{providerData.name}</span>
            </Button>
          );
        })}
    </div>
  );
};

export default OauthOptions;
