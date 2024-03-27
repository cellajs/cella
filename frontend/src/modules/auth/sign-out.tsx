import { useNavigate } from '@tanstack/react-router';
import { useEffect } from 'react';
import { signOutUser } from '~/router/routeTree';

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
