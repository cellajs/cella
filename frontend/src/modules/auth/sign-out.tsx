import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { queryClient } from '~/lib/router';
import { signOut } from '~/modules/auth/api';
import { toaster } from '~/modules/common/toaster';
import type { MeUser } from '~/modules/users/types';
import { useDraftStore } from '~/store/draft';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';

export const signOutUser = async () => {
  await signOut();
};

export const flushStoresAndCache = () => {
  queryClient.clear();
  useUserStore.setState({ user: null as unknown as MeUser });
  useDraftStore.getState().clearForms();
  useNavigationStore.getState().clearNavigationStore();
  sessionStorage.removeItem(`${config.slug}-impersonating`);
};

// Sign out user and clear all stores and query cache
const SignOut = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    signOutUser().then(() => {
      flushStoresAndCache();
      toaster(t('common:success.signed_out'), 'success');
      navigate({ to: '/about', replace: true });
    });
  }, []);

  return null;
};

export default SignOut;
