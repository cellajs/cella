import { EllipsisVertical, Plus, Settings, Tag } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { TooltipButton } from '~/modules/common/tooltip-button';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';

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
        <DropdownMenuContent className="min-w-48" align="end">
          <DropdownMenuItem onClick={() => createNewProject()} className="flex items-center gap-2">
            <Plus size={14} />
            <span>{t('common:new_project')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openLabelsSheet()} className="flex items-center gap-2">
            <Tag size={14} />
            <span>{t('common:labels')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openSettingsSheet()} className="flex items-center gap-2">
            <Settings size={14} />
            <span>{t('common:settings')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default WorkspaceActions;
