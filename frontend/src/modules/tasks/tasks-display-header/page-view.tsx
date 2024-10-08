import { PanelTopClose } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AvatarWrap } from '~/modules/common/avatar-wrap';
import { TooltipButton } from '~/modules/common/tooltip-button';

import { Button } from '~/modules/ui/button';
import type { Workspace } from '~/types/app';

interface PageViewProps {
  workspace: Workspace;
  showPageHeader: boolean;
  toggleFocus: () => void;
}

const PageView = ({ workspace, showPageHeader, toggleFocus }: PageViewProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex gap-2">
      <TooltipButton toolTipContent={t('common:page_view')}>
        <Button variant="outline" className="h-10 w-10 min-w-10" size="auto" onClick={toggleFocus}>
          {showPageHeader ? (
            <PanelTopClose size={16} />
          ) : (
            <AvatarWrap className="cursor-pointer" type="workspace" id={workspace.id} name={workspace.name} url={workspace.thumbnailUrl} />
          )}
        </Button>
      </TooltipButton>
    </div>
  );
};

export default PageView;
