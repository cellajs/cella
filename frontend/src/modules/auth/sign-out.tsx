import * as Sentry from '@sentry/react';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { HeartIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/api.gen';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { toaster } from '~/modules/common/toaster/service';
import { flushStores } from '~/utils/flush-stores';

// Sign out user and clear all stores and query cache
export function SignOut() {
  const { t } = useTranslation();
  const navigate = useNavigate();

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
        navigate({ to: '/about', replace: true });
      } catch (error) {
        console.error('Sign out error:', error);
        Sentry.captureException(error);
        toaster(t('common:already_signed_out'), 'warning');
        navigate({ to: '/about', replace: true });
      }
    };

    handleSignOut();
  }, []);

  return <ContentPlaceholder className="h-screen" icon={HeartIcon} title="common:signing_out" />;
}
