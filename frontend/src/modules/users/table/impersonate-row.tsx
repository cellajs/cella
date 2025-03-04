import { config } from 'config';
import { VenetianMask } from 'lucide-react';
import { toast } from 'sonner';
import { i18n } from '~/lib/i18n';
import router from '~/lib/router';
import { impersonationStart } from '~/modules/auth/api';
import { toaster } from '~/modules/common/toaster';
import { Button } from '~/modules/ui/button';
import { getAndSetMe, getAndSetMenu } from '~/modules/users/helpers';
import type { User } from '~/modules/users/types';
import { useGeneralStore } from '~/store/general';

interface Props {
  user: User;
  tabIndex: number;
}

const handleStartImpersonation = async (userId: string) => {
  try {
    await impersonationStart(userId);
    useGeneralStore.getState().setImpersonating(true);
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
    <Button
      variant="cell"
      size="icon"
      tabIndex={tabIndex}
      className="w-full h-full"
      data-tooltip="true"
      data-tooltip-content={i18n.t('common:impersonate')}
      onClick={() => handleStartImpersonation(user.id)}
    >
      <VenetianMask size={16} />
    </Button>
  );
};

export default ImpersonateRow;
