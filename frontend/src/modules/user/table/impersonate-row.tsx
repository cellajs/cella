import i18n from 'i18next';
import { VenetianMaskIcon } from 'lucide-react';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { startImpersonationFlow } from '~/modules/me/helpers';
import { Button } from '~/modules/ui/button';
import type { BaseUser } from '~/modules/user/types';
import router from '~/routes/router';

interface Props {
  user: BaseUser;
  tabIndex: number;
}

async function handleStartImpersonation(targetUserId: string) {
  try {
    await startImpersonationFlow(targetUserId);
    toaster(i18n.t('c:success.impersonated'), 'success');
    router.navigate({ to: appConfig.defaultRedirectPath, replace: true });
  } catch (error) {
    toaster(i18n.t('error:impersonation_failed'), 'error');
    console.error(error);
  }
}

export function ImpersonateRow({ user, tabIndex }: Props) {
  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center"
      data-tooltip="true"
      data-tooltip-content={i18n.t('c:impersonate')}
      onClick={() => handleStartImpersonation(user.id)}
    >
      <VenetianMaskIcon size={16} />
    </Button>
  );
}
