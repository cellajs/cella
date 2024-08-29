import type { MeUser, User } from '~/types';

import { VenetianMask } from 'lucide-react';

import { useNavigate } from '@tanstack/react-router';
import { impersonateSignIn } from '~/api/auth';
import { Button } from '~/modules/ui/button';
import { getAndSetMe, getAndSetMenu } from '~/routes';
import { useUserStore } from '~/store/user';

interface Props {
  user: User;
}

const ImpersonateRow = ({ user }: Props) => {
  const currentUser = useUserStore((state) => state.user);

  const navigate = useNavigate();
  const impersonateClick = async () => {
    useUserStore.setState({ user: null as unknown as MeUser });
    await impersonateSignIn(user.id);
    navigate({ to: '/', replace: true });
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
  };
  if (user.id === currentUser.id) return null;
  return (
    <Button variant="link" size="micro" className="w-full h-full" onClick={impersonateClick}>
      <VenetianMask size={18} />
    </Button>
  );
};

export default ImpersonateRow;
