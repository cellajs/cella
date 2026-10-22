import { useNavigate } from '@tanstack/react-router';
import { UserXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { stopImpersonationFlow } from '~/modules/me/helpers';
import { navIconStrokeWidth, navItemIconClass, SidebarNavButton } from '~/modules/navigation/nav-buttons';
import { useUserStore } from '~/modules/user/user-store';

interface StopImpersonationProps {
  isCollapsed: boolean;
}

export function StopImpersonation({ isCollapsed }: StopImpersonationProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const impersonator = useUserStore((state) => state.impersonator);

  const stopImpersonation = async () => {
    await stopImpersonationFlow();
    navigate({ to: appConfig.defaultRedirectPath, replace: true });
    toaster.success(t('c:success.stopped_impersonation'));
  };

  if (!impersonator) return null;

  return (
    <SidebarNavButton label={t('c:stop_impersonation')} isCollapsed={isCollapsed} onClick={stopImpersonation}>
      <UserXIcon className={navItemIconClass} strokeWidth={navIconStrokeWidth} />
    </SidebarNavButton>
  );
}
