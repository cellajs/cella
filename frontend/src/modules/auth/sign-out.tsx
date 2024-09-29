import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { signOut } from '~/api/auth';
import { showToast } from '~/lib/toasts';
import { useDraftStore } from '~/store/draft';
import { useUserStore } from '~/store/user';
import type { MeUser } from '~/types/common';

export const signOutUser = async () => {
  useUserStore.setState({ user: null as unknown as MeUser });
  await signOut();
  useDraftStore.getState().clearForms(); // Clear all drafts when signing out
};

const SignOut = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  useEffect(() => {
    signOutUser().then(() => {
      showToast(t('common:success.signed_out'), 'success');
      navigate({ to: '/about', replace: true });
    });
  }, []);

  return null;
};

export default SignOut;
