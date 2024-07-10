import { Button } from '~/modules/ui/button';
import { EllipsisVertical, Tag, Settings, Plus } from 'lucide-react';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '~/modules/ui/dropdown-menu';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';

interface WorkspaceActionsProps {
  createNewProject: () => void;
  openSettingsSheet: () => void;
  openLabelsSheet: () => void;
}

const WorkspaceActions = ({ createNewProject, openLabelsSheet, openSettingsSheet }: WorkspaceActionsProps) => {
  const { t } = useTranslation();
  return (
    <>
      <TooltipButton className="max-md:hidden" toolTipContent={t('common:manage_labels')}>
        <Button variant="outline" onClick={openLabelsSheet}>
          <Tag size={16} />
          <span className="ml-1 max-lg:hidden">{t('common:labels')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton className="max-md:hidden" toolTipContent={t('common:workspace_settings')}>
        <Button variant="outline" onClick={openSettingsSheet}>
          <Settings size={16} />
        </Button>
      </TooltipButton>

      <DropdownMenu>
        <DropdownMenuTrigger className="md:hidden" asChild>
          <Button variant="outline" aria-label="Workspace options">
            <EllipsisVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => createNewProject()} className="flex items-center justify-between">
            <span>{t('common:new_project')}</span>
            <Plus size={14} />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openLabelsSheet()} className="flex items-center justify-between">
            <span>{t('common:labels')}</span>
            <Tag size={14} />
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openSettingsSheet()} className="flex items-center justify-between">
            <span>{t('common:settings')}</span>
            <Settings size={14} />
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default WorkspaceActions;
