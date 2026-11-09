import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type EnabledOAuthProvider, isStrategyEnabled } from 'shared';
import type { BaseOAuthProviders } from 'shared/config-builder/types';
import type { AuthAlternative } from '~/modules/auth/auth-alternatives';
import { useAuthStore } from '~/modules/auth/auth-store';
import { invitationResumePath } from '~/modules/auth/post-auth-redirect';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import type { AuthStep } from '~/modules/auth/types';
import type { IconComponent } from '~/modules/common/icons/types';
import { cn } from '~/utils/cn';

const oauthProviderNames = { github: 'GitHub', google: 'Google', microsoft: 'Microsoft' } satisfies Record<BaseOAuthProviders, string>;

/** The providers the app config enables, in its order. */
export const enabledOAuthProviders = appConfig.enabledOAuthProviders.map((id) => ({
  id,
  name: oauthProviderNames[id],
  icon: (() => <OAuthProviderIcon id={id} />) satisfies IconComponent,
}));

/** A provider's logo, beside text that names the provider. */
export function OAuthProviderIcon({ id }: { id: EnabledOAuthProvider }) {
  return (
    <img src={`/static/auth/${id}-icon.svg`} alt="" className={cn('size-4', id === 'github' && 'dark:invert')} loading="lazy" draggable={false} />
  );
}

/** A way in per enabled provider, worded for `authStep`; none when the strategy is off. */
export function useOAuthAlternatives(authStep: AuthStep): AuthAlternative[] {
  const { t } = useTranslation();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });
  const inviteOtherAccount = useAuthStore((state) => state.inviteOtherAccount);

  const [loadingProvider, setLoadingProvider] = useState<EnabledOAuthProvider | null>(null);

  const labelKey = authStep === 'signIn' ? 'c:sign_in_with' : 'c:continue_with';

  const authenticateWithProvider = (provider: EnabledOAuthProvider) => {
    setLoadingProvider(provider);
    const params = new URLSearchParams();

    // Only forward an explicit deep link: a default reads as explicit server-side and skips the welcome page for new users.
    const redirectAfter = safeRedirectPath(redirect);
    if (redirectAfter) params.set('redirectAfter', redirectAfter);

    if (tokenId && inviteOtherAccount) {
      // Another account: a plain sign-in back to the confirm step, since the invite flow requires the invited address.
      params.set('kind', 'auth');
      params.set('redirectAfter', invitationResumePath(tokenId));
    } else if (tokenId) {
      params.set('tokenId', tokenId);
      params.set('kind', 'invite');
    } else {
      params.set('kind', 'auth');
    }

    window.location.assign(`${appConfig.backendAuthUrl}/${provider}?${params}`);
  };

  if (!isStrategyEnabled('oauth')) return [];

  return enabledOAuthProviders.map(({ id, name, icon }) => ({
    id,
    icon,
    label: t(labelKey, { provider: name }),
    shortLabel: name,
    loading: loadingProvider === id,
    onClick: () => authenticateWithProvider(id),
  }));
}
