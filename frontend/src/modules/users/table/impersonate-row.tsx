import { appConfig } from 'config';
import i18n from 'i18next';
import { VenetianMask } from 'lucide-react';
import { toast } from 'sonner';
import { startImpersonation } from '~/api.gen';
import router from '~/lib/router';
import { toaster } from '~/modules/common/toaster';
import { getAndSetMe, getAndSetMenu } from '~/modules/me/helpers';
import { Button } from '~/modules/ui/button';
import type { User } from '~/modules/users/types';
import { useUIStore } from '~/store/ui';

interface Props {
  user: User;
  tabIndex: number;
}

const handleStartImpersonation = async (targetUserId: string) => {
  try {
    await startImpersonation({ query: { targetUserId } });
    useUIStore.getState().setImpersonating(true);
    await Promise.all([getAndSetMe(), getAndSetMenu()]);
    toast.success(i18n.t('common:success.impersonated'));
    router.navigate({ to: appConfig.defaultRedirectPath, replace: true });
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
