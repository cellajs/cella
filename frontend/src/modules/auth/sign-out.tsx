import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { signOut } from '~/api/authentication';
import { useUserStore } from '~/store/user';
import type { User } from '~/types';

export const signOutUser = async () => {
  useUserStore.setState({ user: null as unknown as User });
  await signOut();
};

const SignOut = () => {
  const navigate = useNavigate();

  useEffect(() => {
    signOutUser().then(() => {
      navigate({ to: '/', replace: true });
    });
  }, []);

  return null;
};

export default SignOut;
