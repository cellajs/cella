import { useNavigate, useSearch } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/modules/auth/api';
import { toaster } from '~/modules/common/toaster';
import type { MeUser } from '~/modules/users/types';
import { queryClient } from '~/query/query-client';
import { SignOutRoute } from '~/routes/auth';
import { useAlertStore } from '~/store/alert';
import { useDraftStore } from '~/store/draft';
import { useGeneralStore } from '~/store/general';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

export const flushStoresAndCache = (removeAccount?: boolean) => {
  queryClient.clear();
  useUserStore.setState({ user: null as unknown as MeUser });
  useDraftStore.getState().clearForms();
  useNavigationStore.getState().clearNavigationStore();
  useGeneralStore.getState().setImpersonating(false);

  if (!removeAccount) return;
  useAlertStore.getState().clearAlertStore();
  useGeneralStore.getState().clearGeneralStore();
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

    const performSignOut = async () => {
      try {
        await signOut();
        flushStoresAndCache(!!force);
        toaster(t('common:success.signed_out'), 'success');
        navigate({ to: '/about', replace: true });
      } catch (error) {
        toaster(t('common:error.signed_out_failed'), 'error');
      }
    };

    performSignOut();
  }, []);

  return null;
};
