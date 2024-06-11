import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { signOut } from '~/api/authentication';
import { useDraftStore } from '~/store/draft';
import { useUserStore } from '~/store/user';
import type { MeUser } from '~/types';

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
      toast.success(t('common:success.signed_out'));
      navigate({ to: '/about', replace: true });
    });
  }, []);

  return null;
};

export default SignOut;
