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
import { isEnabledAuthStrategy, isEnabledOauthProvider } from '#/lib/auth';
import type { EnabledOauthProviderOptions } from '#/types/common';
import type { Step } from '.';

const baseOauthProviders = [
  { id: 'github', name: 'Github', url: githubSignInUrl },
  { id: 'google', name: 'Google', url: googleSignInUrl },
  { id: 'microsoft', name: 'Microsoft', url: microsoftSignInUrl },
];

interface OauthOptions {
  id: EnabledOauthProviderOptions;
  name: string;
  url: string;
}
// Filter the OAuth providers to only include enabled providers
export const oauthProviders = baseOauthProviders.filter((prov): prov is OauthOptions => isEnabledOauthProvider(prov.id));

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

  const invertClass = mode === 'dark' ? 'invert' : '';
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
    <>
      <div className="relative flex justify-center text-xs uppercase">
        <span className="text-muted-foreground px-2">{t('common:or')}</span>
      </div>

      <div className="flex flex-col space-y-2">
        {isEnabledAuthStrategy('passkey') && hasPasskey && actionType === 'signIn' && (
          <Button type="button" onClick={() => passkeyAuth(email, successesCallback)} variant="plain" className="w-full gap-1.5">
            <Fingerprint size={16} />
            {t('common:passkey_sign_in')}
          </Button>
        )}
        {isEnabledAuthStrategy('oauth') &&
          oauthProviders.map((provider) => {
            return (
              <Button
                loading={loading}
                key={provider.name}
                type="button"
                variant="outline"
                className="gap-1.5"
                onClick={() => {
                  setLoading(true);
                  if (token) {
                    acceptInvite({ token, oauth: provider.id }).then(() => {
                      window.location.href = config.defaultRedirectPath;
                    });
                  } else {
                    window.location.href = provider.url + redirectQuery;
                  }
                }}
              >
                <img
                  src={`/static/images/${provider.name.toLowerCase()}-icon.svg`}
                  alt={provider.name}
                  className={`w-4 h-4 ${provider.id === 'github' ? invertClass : ''}`}
                  loading="lazy"
                />
                {token ? t('common:accept') : actionType === 'signUp' ? t('common:sign_up') : t('common:sign_in')} with {provider.name}
              </Button>
            );
          })}
      </div>
    </>
  );
};

export default OauthOptions;
