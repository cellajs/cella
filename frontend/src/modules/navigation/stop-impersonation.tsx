import { useNavigate } from '@tanstack/react-router';
import { UserXIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { appConfig } from 'shared';
import { toaster } from '~/modules/common/toaster/toaster';
import { stopImpersonationFlow } from '~/modules/me/helpers';
import { SidebarMenuButton, SidebarMenuItem } from '~/modules/ui/sidebar';
import { useUIStore } from '~/modules/ui/ui-store';

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

  const { impersonating } = useUIStore();

  const stopImpersonation = async () => {
    await stopImpersonationFlow();
    navigate({ to: appConfig.defaultRedirectPath, replace: true });
    toaster.success(t('c:success.stopped_impersonation'));
  };

  if (!impersonating) return null;

  const showTooltip = isCollapsed || !hasSidebarTextLabels;

  return (
    <SidebarMenuItem className="flex grow-0 transform justify-start pb-2">
      <SidebarMenuButton
        size="lg"
        data-collapsed={isCollapsed}
        tooltip={{ children: t('c:stop_impersonation'), hidden: !showTooltip }}
        onClick={stopImpersonation}
        className="group linear h-14 w-full justify-center text-sidebar-foreground ring-inset transition-[width] duration-200 hover:bg-background/30 focus-visible:ring-offset-0 data-[collapsed=true]:w-16"
      >
        <UserXIcon
          className="size-5 min-h-5 min-w-5 shrink-0 transition-transform group-hover:scale-110"
          strokeWidth={1.8}
        />
        {hasSidebarTextLabels && (
          <span className="linear w-auto overflow-hidden whitespace-nowrap pl-1.5 font-medium opacity-100 transition-[opacity,width] duration-200 group-data-[collapsed=true]:w-0 group-data-[collapsed=true]:opacity-0">
            {t('c:stop_impersonation')}
          </span>
        )}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}
