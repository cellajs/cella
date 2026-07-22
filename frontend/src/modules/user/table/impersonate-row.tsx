import i18n from 'i18next';
import { VenetianMaskIcon } from 'lucide-react';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { startImpersonationFlow } from '~/modules/me/helpers';
import { Button } from '~/modules/ui/button';
import type { BaseUser } from '~/modules/user/types';
import { getRouter } from '~/routes/-router-instance';

interface Props {
  user: BaseUser;
  tabIndex: number;
}

async function handleStartImpersonation(targetUserId: string) {
  try {
    await startImpersonationFlow(targetUserId);
    toaster.success(i18n.t('c:success.impersonated'));
    getRouter().navigate({ to: appConfig.defaultRedirectPath, replace: true });
  } catch (error) {
    toaster.error(i18n.t('error:impersonation_failed'));
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
      <VenetianMaskIcon />
    </Button>
  );
}
