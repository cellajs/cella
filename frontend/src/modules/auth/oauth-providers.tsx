import { useSearch } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { appConfig, type EnabledOAuthProvider } from 'shared';
import { useAuthStore } from '~/modules/auth/auth-store';
import { safeRedirectPath } from '~/modules/auth/redirect-path';
import type { AuthStep } from '~/modules/auth/types';
import { invitationResumePath } from '~/modules/auth/use-post-auth-redirect';
import { toaster } from '~/modules/common/toaster/toaster';
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

/**
 * Display OAuth providers to sign in, sign up, accept invitation
 *
 * @param authStep The action type to perform
 */
export function OAuthProviders({ authStep }: { authStep: AuthStep }) {
  const { t } = useTranslation();
  const { tokenId, redirect } = useSearch({ from: '/_public/auth/authenticate' });
  const inviteOtherAccount = useAuthStore((state) => state.inviteOtherAccount);

  const [loadingProvider, setLoadingProvider] = useState<EnabledOAuthProvider | null>(null);

  const actionText = authStep === 'signIn' ? t('c:sign_in') : authStep === 'signUp' ? t('c:sign_up') : t('c:continue');

  const authenticateWithProvider = async (provider: EnabledOAuthProvider) => {
    try {
      setLoadingProvider(provider);

      const baseUrl = `${appConfig.backendAuthUrl}/${provider}`;
      const params = new URLSearchParams();

      // Only forward an explicit deep link: a default reads as explicit server-side and skips the welcome page for new users.
      const redirectAfter = safeRedirectPath(redirect);
      if (redirectAfter) params.set('redirectAfter', redirectAfter);

      if (tokenId && inviteOtherAccount) {
        // Another account than the invited address: a plain sign-in that returns to confirm the invitation.
        // The invite flow would refuse it, since it requires the provider address to match the invited one.
        params.set('type', 'auth');
        params.set('redirectAfter', invitationResumePath(tokenId));
      } else if (tokenId) {
        params.set('tokenId', tokenId);
        params.set('type', 'invite');
      } else params.set('type', 'auth');

      const providerUrl = `${baseUrl}?${params.toString()}`;
      window.location.assign(providerUrl);
    } catch (error) {
      toaster.error(t('c:url_malformed'));
      setLoadingProvider(null);
    }
  };

  if (!enabledOAuthProviders.length) return null;

  return (
    <div className="flex flex-col gap-2">
      {enabledOAuthProviders.map(({ id, name }) => (
        <Button loading={loadingProvider === id} key={id} type="button" variant="plain" onClick={() => authenticateWithProvider(id)}>
          <img src={`/static/auth/${id}-icon.svg`} alt={id} className={cn('size-4', id === 'github' && 'dark:invert')} loading="lazy" />
          <span>
            {actionText} {t('c:with').toLowerCase()} {name}
          </span>
        </Button>
      ))}
    </div>
  );
}
