import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { queryClient } from '~/lib/router';
import { signOut } from '~/modules/auth/api';
import { createToast } from '~/modules/common/toaster';
import { useDraftStore } from '~/store/draft';
import { useNavigationStore } from '~/store/navigation';
import { useUserStore } from '~/store/user';
import type { MeUser } from '~/types/common';

export const signOutUser = async () => {
  await signOut();
};

export const flushStoresAndCache = () => {
  queryClient.clear();
  useUserStore.setState({ user: null as unknown as MeUser });
  useDraftStore.getState().clearForms();
  useNavigationStore.getState().clearNavigationStore();
};

const SignOut = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    signOutUser().then(() => {
      flushStoresAndCache();
      createToast(t('common:success.signed_out'), 'success');
      navigate({ to: '/about', replace: true });
    });
  }, []);

  return null;
};

export default SignOut;
