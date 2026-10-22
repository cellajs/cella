import { Link } from '@tanstack/react-router';
import { PencilIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { DocsSidebarSection } from '~/modules/docs/sidebar/docs-sidebar-section';
import { closeSidebarSheetAndNavigate } from '~/modules/docs/sidebar/docs-sidebar-sheet';
import { PagesSidebar } from '~/modules/docs/sidebar/pages-sidebar';
import { Button } from '~/modules/ui/button';
import { useUserStore } from '~/modules/user/user-store';

interface PagesSectionProps {
  label: string;
}

/** Sidebar section with the docs pages tree (plus the admin manage-pages shortcut). */
export function PagesSection({ label }: PagesSectionProps) {
  const { t } = useTranslation();
  const isSystemAdmin = useUserStore((state) => state.isSystemAdmin);

  return (
    <DocsSidebarSection
      label={label}
      action={
        isSystemAdmin && (
          <TooltipButton toolTipContent={t('c:manage_pages')} side="right">
            <Button
              variant="ghost"
              size="xs"
              className="h-7 w-8 p-0"
              render={<Link to="/docs/pages" onClick={closeSidebarSheetAndNavigate} aria-label={t('c:manage_pages')} />}
            >
              <PencilIcon className="size-3.5" />
            </Button>
          </TooltipButton>
        )
      }
    >
      <PagesSidebar />
    </DocsSidebarSection>
  );
}
