import { useNavigate, useSearch } from '@tanstack/react-router';
import { Heart } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/modules/auth/api';
import ContentPlaceholder from '~/modules/common/content-placeholder';
import { toaster } from '~/modules/common/toaster';
import type { MeUser } from '~/modules/me/types';
import { queryClient } from '~/query/query-client';
import { SignOutRoute } from '~/routes/auth';
import { useAlertStore } from '~/store/alert';
import { useDraftStore } from '~/store/draft';
import { useNavigationStore } from '~/store/navigation';
import { useSyncStore } from '~/store/sync';
import { useUIStore } from '~/store/ui';
import { useUserStore } from '~/store/user';

export const flushStoresAndCache = (removeAccount?: boolean) => {
  queryClient.clear();
  useUserStore.setState({ user: null as unknown as MeUser });
  useSyncStore.setState({ data: {} });
  useDraftStore.getState().clearForms();
  useNavigationStore.getState().clearNavigationStore();
  useUIStore.getState().setImpersonating(false);

  if (!removeAccount) return;
  // Clear below on remove account
  useAlertStore.getState().clearAlertStore();
  useUIStore.getState().clearUIStore();
  useUserStore.setState({ lastUser: null as unknown as MeUser, passkey: false, oauth: [] });
};

// Sign out user and clear all stores and query cache
export const SignOut = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { force } = useSearch({ from: SignOutRoute.id });

  const signOutTriggeredRef = useRef(false);

  useEffect(() => {
    if (signOutTriggeredRef.current) return;

    signOutTriggeredRef.current = true;

    const handleSignOut = async () => {
      try {
        await signOut();
        flushStoresAndCache(!!force);
        toaster(t('common:success.signed_out'), 'success');
        navigate({ to: '/about', replace: true });
      } catch (error) {
        toaster(t('common:error.signed_out_failed'), 'error');
      }
    };

    handleSignOut();
  }, []);

  return <ContentPlaceholder className="h-screen" icon={Heart} title={t('common:signing_out')} />;
};
