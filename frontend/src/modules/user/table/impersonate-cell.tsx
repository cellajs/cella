import { VenetianMaskIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { startImpersonationFlow } from '~/modules/me/helpers';
import { Button } from '~/modules/ui/button';
import type { BaseUser } from '~/modules/user/types';
import { getRouter } from '~/routes/-router-instance';

interface ImpersonateCellProps {
  user: BaseUser;
  tabIndex: number;
}

export function ImpersonateCell({ user, tabIndex }: ImpersonateCellProps) {
  const { t } = useTranslation();

  const impersonate = async () => {
    try {
      await startImpersonationFlow(user.id);
      toaster.success(t('c:success.impersonated'));
      getRouter().navigate({ to: appConfig.defaultRedirectPath, replace: true });
    } catch (error) {
      toaster.error(t('error:impersonation_failed'));
      console.error(error);
    }
  };

  return (
    <Button
      variant="cell"
      size="cell"
      tabIndex={tabIndex}
      className="justify-center"
      aria-label={t('c:impersonate')}
      data-tooltip="true"
      data-tooltip-content={t('c:impersonate')}
      onClick={impersonate}
    >
      <VenetianMaskIcon />
    </Button>
  );
}
