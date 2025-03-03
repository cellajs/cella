import { config } from 'config';
import { VenetianMask } from 'lucide-react';
import { toast } from 'sonner';
import { i18n } from '~/lib/i18n';
import router from '~/lib/router';
import { impersonationStart } from '~/modules/auth/api';
import { toaster } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import type { MeUser, User } from '~/modules/users/types';
import { useGeneralStore } from '~/store/general';
import { useUserStore } from '~/store/user';

interface Props {
  user: User;
  tabIndex: number;
}

const handleStartImpersonation = async (userId: string) => {
  try {
    await impersonationStart(userId);
    useUserStore.setState({ user: null as unknown as MeUser });
    useGeneralStore.getState().setImpersonating(true);
    // TODO this seems to cause for a short interval user is null, causing a JS error?
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    toast.success(i18n.t('common:success.impersonated'));
    router.navigate({ to: config.defaultRedirectPath, replace: true });
  } catch (error) {
    toaster(i18n.t('error:impersonation_failed'), 'error');
    console.error(error);
  }
};

const ImpersonateRow = ({ user, tabIndex }: Props) => {
  return (
    <Button variant="cell" size="icon" tabIndex={tabIndex} className="w-full h-full" onClick={() => handleStartImpersonation(user.id)}>
      <VenetianMask size={16} />
    </Button>
  );
};

export default ImpersonateRow;
