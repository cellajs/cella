import { useSearch } from '@tanstack/react-router';
import { HeartIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from 'sdk';
import { appConfig } from 'shared';
import { ContentPlaceholder } from '~/modules/common/content-placeholder';
import { toaster } from '~/modules/common/toaster/toaster';
import { teardownUserState } from '~/utils/teardown-user-state';

// Sign out user and clear all stores and query cache
export function SignOut() {
  const { t } = useTranslation();

  const { force } = useSearch({ from: '/_public/auth/sign-out' });

  const signOutTriggeredRef = useRef(false);

  useEffect(() => {
    if (signOutTriggeredRef.current) return;

    signOutTriggeredRef.current = true;

    const handleSignOut = async () => {
      try {
        teardownUserState();
        if (!force) await signOut();
        toaster.success(t('c:success.signed_out'));
      } catch (error) {
        console.error('Sign out error:', error);
        toaster.warning(t('c:already_signed_out'));
      }
      // Force full page reload to ensure clean state
      window.location.href = appConfig.aboutUrl;
    };

    handleSignOut();
  }, []);

  return <ContentPlaceholder className="h-screen" icon={HeartIcon} title="c:signing_out" />;
}
