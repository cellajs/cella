import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import { useAuthStore } from '~/modules/auth/auth-store';
import { invitationResumePath } from '~/modules/auth/post-auth-redirect';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import type { AuthStep } from '~/modules/auth/types';
import { Button } from '~/modules/ui/button';
import { cn } from '~/utils/cn';

const oauthProviders = [
  { id: 'github', name: 'GitHub' },
  { id: 'google', name: 'Google' },
  { id: 'microsoft', name: 'Microsoft' },
] as const;

/** The providers the app config enables, in its order. */
export const enabledOAuthProviders = appConfig.enabledOAuthProviders.flatMap((id) =>
  oauthProviders.filter((provider) => provider.id === id).map(({ name }) => ({ id, name })),
);

interface OAuthProviderIconProps {
  id: EnabledOAuthProvider;
}

/** A provider's logo, beside text that names the provider. */
export function OAuthProviderIcon({ id }: OAuthProviderIconProps) {
  return (
    <img src={`/static/auth/${id}-icon.svg`} alt="" className={cn('size-4', id === 'github' && 'dark:invert')} loading="lazy" draggable={false} />
  );
}

interface OAuthProvidersProps {
  /** Picks the buttons' wording: sign in, sign up, or continue on any other step. */
  authStep: AuthStep;
}

/** A button per enabled provider, which starts its round trip for a sign-in, a sign-up or the invitation in hand. */
export function OAuthProviders({ authStep }: OAuthProvidersProps) {
  const { t } = useTranslation();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });
  const inviteOtherAccount = useAuthStore((state) => state.inviteOtherAccount);

  const [loadingProvider, setLoadingProvider] = useState<EnabledOAuthProvider | null>(null);

  const labelKey = authStep === 'signIn' ? 'c:sign_in_with' : authStep === 'signUp' ? 'c:sign_up_with' : 'c:continue_with';

  const authenticateWithProvider = (provider: EnabledOAuthProvider) => {
    setLoadingProvider(provider);
    const params = new URLSearchParams();

    // Only forward an explicit deep link: a default reads as explicit server-side and skips the welcome page for new users.
    const redirectAfter = safeRedirectPath(redirect);
    if (redirectAfter) params.set('redirectAfter', redirectAfter);

    if (tokenId && inviteOtherAccount) {
      // Another account: a plain sign-in back to the confirm step, since the invite flow requires the invited address.
      params.set('type', 'auth');
      params.set('redirectAfter', invitationResumePath(tokenId));
    } else if (tokenId) {
      params.set('tokenId', tokenId);
      params.set('type', 'invite');
    } else params.set('type', 'auth');

    window.location.assign(`${appConfig.backendAuthUrl}/${provider}?${params}`);
  };

  if (!enabledOAuthProviders.length) return null;

  return (
    // The backdrop sets these alternatives apart, so their outline edge drops; increased contrast brings it back
    <div className="edgeless flex flex-col gap-2">
      {enabledOAuthProviders.map(({ id, name }) => (
        <Button loading={loadingProvider === id} key={id} variant="outline" onClick={() => authenticateWithProvider(id)}>
          <OAuthProviderIcon id={id} />
          <span>{t(labelKey, { provider: name })}</span>
        </Button>
      ))}
    </div>
  );
}
