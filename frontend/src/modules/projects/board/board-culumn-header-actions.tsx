import { EllipsisVertical, Minimize2, Plus, Settings, Users } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { dispatchCustomEvent } from '~/lib/custom-events';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useWorkspaceStore } from '~/store/workspace';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project } from '~/types/app';
import { openProjectConfigSheet } from './helpers';

const ProjectActions = ({ project }: { project: Project }) => {
  const { t } = useTranslation();
  const { changeColumn } = useWorkspaceUIStore();

  const { workspace } = useWorkspaceStore();
  const [minimize, setMinimize] = useState(false);
  const role = project.membership?.role || 'member';

  const minimizeClick = () => {
    setMinimize(!minimize);
    changeColumn(workspace.id, project.id, {
      minimized: !minimize,
    });
  };

  return (
    <>
      <div className="grow hidden sm:block" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label="Workspace options">
            <EllipsisVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-48" align="end">
          <DropdownMenuItem onClick={() => openProjectConfigSheet(project)} className="flex items-center gap-2">
            {role === 'admin' ? <Settings size={16} /> : <Users size={16} />}
            <span>{role === 'admin' ? t('common:resource_settings', { resource: t('app:project') }) : t('app:project_members')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => minimizeClick()} className="hidden  sm:flex items-center gap-2">
            <Minimize2 size={16} />
            <span>{t('common:minimize')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button
        variant="plain"
        size="xs"
        className="rounded hidden sm:inline-flex"
        onClick={() => dispatchCustomEvent('toggleCreateTaskForm', project.id)}
      >
        <Plus size={16} />
        <span className="ml-1">{t('app:task')}</span>
      </Button>
      <div className="grow sm:hidden" />
    </>
  );
};

export default ProjectActions;
