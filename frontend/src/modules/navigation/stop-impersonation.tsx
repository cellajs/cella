import { useNavigate } from '@tanstack/react-router';
import { UserXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { stopImpersonation as breakImpersonation } from '~/api.gen';
import { toaster } from '~/modules/common/toaster/service';
import { getAndSetMe } from '~/modules/me/helpers';
import { getMenuData } from '~/modules/navigation/menu-sheet/helpers';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { useUIStore } from '~/store/ui';

const { hasSidebarTextLabels } = appConfig.theme.navigation;

interface StopImpersonationProps {
  isCollapsed: boolean;
}

/**
 * Button to stop impersonation, styled consistently with nav buttons.
 */
export function StopImpersonation({ isCollapsed }: StopImpersonationProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { impersonating, setImpersonating, theme } = useUIStore();

  const stopImpersonation = async () => {
    await breakImpersonation();
    setImpersonating(false);
    await Promise.all([getAndSetMe(), getMenuData()]);
    navigate({ to: appConfig.defaultRedirectPath, replace: true });
    toaster(t('common:success.stopped_impersonation'), 'success');
  };

  if (!impersonating) return null;

  const showTooltip = isCollapsed || !hasSidebarTextLabels;

  return (
    <SidebarMenuItem className="flex transform grow-0 justify-start pb-2">
      <SidebarMenuButton
        size="lg"
        data-collapsed={isCollapsed}
        tooltip={{ children: t('common:stop_impersonation'), hidden: !showTooltip }}
        onClick={stopImpersonation}
        data-theme={theme}
        className="h-14 ring-inset focus-visible:ring-offset-0 group transition-[width] duration-200 linear
          hover:bg-background/30 text-primary-foreground data-[theme=none]:text-inherit
          w-full data-[collapsed=true]:w-16 justify-center"
      >
        <UserXIcon
          className="group-hover:scale-110 transition-transform size-5 min-w-5 min-h-5 shrink-0"
          strokeWidth={1.8}
        />
        {hasSidebarTextLabels && (
          <span
            className="pl-1.5 font-medium whitespace-nowrap transition-[opacity,width] duration-200 linear overflow-hidden
            opacity-100 w-auto group-data-[collapsed=true]:opacity-0 group-data-[collapsed=true]:w-0"
          >
            {t('common:stop_impersonation')}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
