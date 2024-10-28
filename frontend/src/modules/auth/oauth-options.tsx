import { useNavigate, useSearch } from '@tanstack/react-router';
import { config } from 'config';
import { Fingerprint } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { githubSignInUrl, googleSignInUrl, microsoftSignInUrl } from '~/api/auth';
import { acceptInvite } from '~/api/general';
import { Button } from '~/modules/ui/button';
import { passkeyAuth } from '~/modules/users/helpers';
import { SignInRoute } from '~/routes/auth';
import { useThemeStore } from '~/store/theme';
import type { EnabledOauthProviderOptions } from '#/types/common';
import type { Step } from '.';

export const mapOauthProviders = [
  { id: 'github', name: 'Github', url: githubSignInUrl },
  { id: 'google', name: 'Google', url: googleSignInUrl },
  { id: 'microsoft', name: 'Microsoft', url: microsoftSignInUrl },
];

const enabledStrategies: readonly string[] = config.enabledAuthenticationStrategies;

interface OauthOptions {
  id: EnabledOauthProviderOptions;
  name: string;
  url: string;
}
// Filter the OAuth providers to only include enabled providers

interface OauthOptionsProps {
  actionType: Step;
  email: string;
  hasPasskey?: boolean;
}

const OauthOptions = ({ email, actionType = 'signIn', hasPasskey }: OauthOptionsProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { mode } = useThemeStore();
  const { token } = useSearch({
    from: SignInRoute.id,
  });

  const [loading, setLoading] = useState(false);

  let redirect = '';
  if (token) {
    const searchResult = useSearch({
      from: SignInRoute.id,
    });
    redirect = searchResult.redirect ?? '';
  }
  const successesCallback = () => {
    toast.success(t('common:success.passkey_sign_in'));
    navigate({ to: config.defaultRedirectPath, replace: true });
  };

  const redirectQuery = redirect ? `?redirect=${redirect}` : '';

  return (
    <div data-mode={mode} className="group flex flex-col space-y-2">
      {hasPasskey && (
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

          return (
            <Button
              loading={loading}
              key={provider}
              type="button"
              variant="outline"
              className="gap-1.5"
              onClick={() => {
                setLoading(true);
                if (token) {
                  acceptInvite({ token, oauth: provider }).then(() => {
                    window.location.href = config.defaultRedirectPath;
                  });
                } else {
                  window.location.href = providerData.url + redirectQuery;
                }
              }}
            >
              <img
                data-provider={provider}
                src={`/static/images/${provider.toLowerCase()}-icon.svg`}
                alt={provider}
                className="w-4 h-4 group-data-[mode=dark]:data-[provider=github]:invert"
                loading="lazy"
              />
              {token ? t('common:accept') : actionType === 'signUp' ? t('common:sign_up') : t('common:sign_in_with', { provider: providerData.name })}
            </Button>
          );
        })}
    </div>
  );
};

export default OauthOptions;
