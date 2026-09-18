import { useSearch } from '@tanstack/react-router';
import { HeartIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from 'sdk';
import { appConfig } from 'shared';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { toaster } from '~/modules/common/toaster/toaster';
import { disablePushSubscription } from '~/modules/notification/use-push-subscription';
import { seenStore } from '~/modules/seen/seen-store';
import { teardownUserState } from '~/utils/teardown-user-state';

export function SignOut() {
  const { t } = useTranslation();

  const { force } = useSearch({ from: '/_public/auth/sign-out' });

  const signOutTriggeredRef = useRef(false);

  useEffect(() => {
    if (signOutTriggeredRef.current) return;

    signOutTriggeredRef.current = true;

    const handleSignOut = async () => {
      try {
        // Session-bound cleanup while requests can still authenticate (`force` means the session is already gone):
        // pending seen batches would beacon after the cookie is gone, and the push subscription belongs to this device's service worker.
        if (!force) await Promise.allSettled([seenStore.getState().flush(), disablePushSubscription()]);
        await teardownUserState();
        if (!force) await signOut();
        toaster.success(t('c:success.signed_out'));
      } catch (error) {
        console.error('Sign out error:', error);
        toaster.warning(t('c:already_signed_out'));
      }
      // Full page reload so every store and cache is rebuilt
      window.location.href = appConfig.aboutUrl;
    };

    handleSignOut();
  }, []);

  return <ContentPlaceholder className="h-svh" icon={HeartIcon} title="c:signing_out" />;
}
