import { Link } from '@tanstack/react-router';
import { PencilIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { PagesSidebar } from '~/modules/docs/sidebar/pages-sidebar';
import { Button } from '~/modules/ui/button';
import { SidebarGroup, SidebarGroupContent, SidebarGroupLabel } from '~/modules/ui/sidebar';
import { useUserStore } from '~/modules/user/user-store';

interface PagesSectionProps {
  label: string;
  onClose: () => void;
}

/** Sidebar section with the docs pages tree (plus the admin manage-pages shortcut). */
export function PagesSection({ label, onClose }: PagesSectionProps) {
  const { t } = useTranslation();
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);

  return (
    <SidebarGroup>
      <div className="flex items-center gap-3 px-4 pr-1">
        <SidebarGroupLabel className="p-0 text-muted-foreground lowercase">{label}</SidebarGroupLabel>
        {isSystemAdmin && (
          <TooltipButton toolTipContent={t('c:manage_pages')} side="right">
            <Button
              variant="ghost"
              size="xs"
              className="h-7 w-8 p-0"
              render={<Link to="/docs/pages" onClick={onClose} aria-label={t('c:manage_pages')} />}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          </TooltipButton>
        )}
      </div>
      <SidebarGroupContent>
        {/* Inner SidebarGroup matches the API reference wrappers so bullets and guideline align */}
        <SidebarGroup className="p-1 pt-0">
          <PagesSidebar />
        </SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
