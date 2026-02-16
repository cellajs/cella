import * as Sentry from '@sentry/react';
import { useSearch } from '@tanstack/react-router';
import { HeartIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/api.gen';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { toaster } from '~/modules/common/toaster/service';
import { resetBoundaryTracker } from '~/routes/boundary-cleanup';
import { flushStores } from '~/utils/flush-stores';

// Sign out user and clear all stores and query cache
export function SignOut() {
  const { t } = useTranslation();

  const { force } = useSearch({ from: '/publicLayout/sign-out' });

  const signOutTriggeredRef = useRef(false);

  useEffect(() => {
    if (signOutTriggeredRef.current) return;

    signOutTriggeredRef.current = true;

    const handleSignOut = async () => {
      try {
        flushStores(!!force);
        if (!force) await signOut();
        toaster(t('common:success.signed_out'), 'success');
      } catch (error) {
        console.error('Sign out error:', error);
        Sentry.captureException(error);
        toaster(t('common:already_signed_out'), 'warning');
      }
      // Reset boundary tracker to ensure sheets don't leak on next navigation
      resetBoundaryTracker();
      // Force full page reload to ensure clean state
      window.location.href = '/about';
    };

    handleSignOut();
  }, []);

  return <ContentPlaceholder className="h-screen" icon={HeartIcon} title="common:signing_out" />;
}
