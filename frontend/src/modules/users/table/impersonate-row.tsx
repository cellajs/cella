import { useNavigate } from '@tanstack/react-router';
import { config } from 'config';
import { VenetianMask } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { impersonationStart } from '~/modules/auth/api';
import { createToast } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import type { MeUser, User } from '~/modules/users/types';
import { useUserStore } from '~/store/user';

interface Props {
  user: User;
  tabIndex: number;
}

const ImpersonateRow = ({ user, tabIndex }: Props) => {
  const { user: currentUser } = useUserStore();
  const { t } = useTranslation();
  const navigate = useNavigate();

  const impersonateClick = async () => {
    try {
      await impersonationStart(user.id);
      useUserStore.setState({ user: null as unknown as MeUser });
      await Promise.all([getAndSetMe(), getAndSetMenu()]);
      toast.success(t('common:success.impersonated'));
      navigate({ to: config.defaultRedirectPath, replace: true });
    } catch (error) {
      createToast(t('error:impersonation_failed'), 'error');
      console.error(error);
    }
  };

  if (user.id === currentUser?.id) return null;

  return (
    <Button variant="cell" size="icon" tabIndex={tabIndex} className="w-full h-full" onClick={impersonateClick}>
      <VenetianMask size={16} />
    </Button>
  );
};

export default ImpersonateRow;
