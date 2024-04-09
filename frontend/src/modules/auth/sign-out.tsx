import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { signOut } from '~/api/authentication';
import { useUserStore } from '~/store/user';
import type { User } from '~/types';

export const signOutUser = async () => {
  useUserStore.setState({ user: null as unknown as User });
  await signOut();
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
