import { useNavigate } from '@tanstack/react-router';
import { useUserStore } from '~/store/user';

const SignOut = () => {
  const signOut = useUserStore((state) => state.signOut);
  const navigate = useNavigate();

  signOut().then(() => {
    navigate({ to: '/', replace: true });
  });

  return <></>;
};

export default SignOut;
