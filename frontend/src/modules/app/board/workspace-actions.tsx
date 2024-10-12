import { EllipsisVertical, Plus, Settings, Tag, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { openProjectConfigSheet } from '~/modules/app/board/helpers';
import { dialog } from '~/modules/common/dialoger/state';
import { sheet } from '~/modules/common/sheeter/state';
import { TooltipButton } from '~/modules/common/tooltip-button';
import AddProjects from '~/modules/projects/add-project';
import LabelsTable from '~/modules/tasks/labels-table';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { WorkspaceSettings } from '~/modules/workspaces/workspace-settings';
import type { Project } from '~/types/app';

interface WorkspaceActionsProps {
  project?: Project | null;
}

const WorkspaceActions = ({ project }: WorkspaceActionsProps) => {
  const { t } = useTranslation();

  const openSettingsSheet = () => {
    sheet.create(<WorkspaceSettings sheet />, {
      side: 'right',
      className: 'max-w-full lg:max-w-4xl',
      title: t('common:resource_settings', { resource: t('app:workspace') }),
      description: t('common:resource_settings.text', { resource: t('app:workspace').toLowerCase() }),
      id: 'edit-workspace',
    });
  };

  const openLabelsSheet = () => {
    sheet.create(<LabelsTable />, {
      className: 'max-w-full lg:max-w-4xl',
      title: t('app:manage_labels'),
      id: 'workspace-preview-labels',
      side: 'right',
    });
  };

  const createNewProject = () => {
    // TODO: change mode when add projects without workspace
    dialog(<AddProjects dialog mode="create" />, {
      className: 'md:max-w-4xl',
      id: 'add-projects',
      title: t('common:add_resource', { resource: t('app:projects').toLowerCase() }),
    });
  };

  return (
    <>
      <TooltipButton className="max-md:hidden" toolTipContent={t('common:add_resource', { resource: t('app:project').toLowerCase() })}>
        <Button variant="plain" onClick={createNewProject}>
          <Plus size={16} />
          <span className="max-lg:hidden ml-1">{t('common:add')}</span>
        </Button>
      </TooltipButton>
      <TooltipButton className="max-md:hidden" toolTipContent={t('app:manage_labels')}>
        <Button variant="outline" onClick={openLabelsSheet}>
          <Tag size={16} />
        </Button>
      </TooltipButton>
      <TooltipButton className="max-md:hidden" toolTipContent={t('common:resource_settings', { resource: t('app:workspace') })}>
        <Button variant="outline" onClick={openSettingsSheet}>
          <Settings size={16} />
        </Button>
      </TooltipButton>

      <DropdownMenu>
        <DropdownMenuTrigger className="md:hidden" asChild>
          <Button variant="ghost" aria-label="Workspace options">
            <EllipsisVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-48" align="end">
          <DropdownMenuItem onClick={createNewProject} className="flex items-center gap-2">
            <Plus size={14} />
            <span>{t('common:add_resource', { resource: t('app:project').toLowerCase() })}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openLabelsSheet} className="flex items-center gap-2">
            <Tag size={14} />
            <span>{t('app:manage_labels')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={openSettingsSheet} className="flex items-center gap-2">
            <Settings size={14} />
            <span>{t('common:resource_settings', { resource: t('app:workspace') })}</span>
          </DropdownMenuItem>
          {project && (
            <DropdownMenuItem onClick={() => openProjectConfigSheet(project)} className="flex items-center gap-2">
              {project.membership?.role === 'admin' ? <Settings size={14} /> : <Users size={14} />}
              <span>
                {project.membership?.role === 'admin' ? t('common:resource_settings', { resource: t('app:project') }) : t('app:project_members')}
              </span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  );
};

export default WorkspaceActions;
