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
  const { isSystemAdmin } = useUserStore();

  return (
    <SidebarGroup>
      <div className="flex items-center gap-3 px-4 pr-1">
        <SidebarGroupLabel className="p-0 lowercase opacity-75">{label}</SidebarGroupLabel>
        {/* Edit pages */}
        {isSystemAdmin && (
          <TooltipButton toolTipContent={t('c:manage_pages')} side="right">
            <Button
              variant="ghost"
              size="xs"
              className="h-7 w-8 p-0"
              render={<Link to="/docs/pages" onClick={onClose} aria-label={t('c:manage_pages')} />}
            >
              <PencilIcon size={14} />
            </Button>
          </TooltipButton>
        )}
      </div>
      {/* List of pages */}
      <SidebarGroupContent>
        {/* Inner SidebarGroup mirrors the operations/schemas wrappers so tier-1 bullets
            and guideline align with the API reference section (their p-1 adds 4px left). */}
        <SidebarGroup className="p-1 pt-0">
          <PagesSidebar onClose={onClose} />
        </SidebarGroup>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
