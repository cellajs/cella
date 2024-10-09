import { EllipsisVertical, Minimize2, Plus, Settings, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { showToast } from '~/lib/toasts';
import { Button } from '~/modules/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '~/modules/ui/dropdown-menu';
import { useWorkspaceQuery } from '~/modules/workspaces/use-workspace';
import { useWorkspaceUIStore } from '~/store/workspace-ui';
import type { Project } from '~/types/app';
import { openProjectConfigSheet } from './helpers';

const ProjectActions = ({ project }: { project: Project }) => {
  const { t } = useTranslation();
  const { changeColumn, workspaces } = useWorkspaceUIStore();

  const {
    data: { workspace, projects },
  } = useWorkspaceQuery();

  const { minimized, createTaskForm } = workspaces[workspace.id]?.[project.id] || { minimized: false, createTaskForm: false };

  const role = project.membership?.role || 'member';

  const minimizeClick = () => {
    // Check if all other projects are minimized
    const allOtherMinimized = projects.every((p) => {
      return p.id === project.id || workspaces[workspace.id]?.[p.id]?.minimized;
    });

    if (allOtherMinimized) return showToast(t('app:no_minimize_last'), 'error');

    // Proceed with minimizing the current project
    changeColumn(workspace.id, project.id, {
      minimized: true,
    });
  };

  const createTaskClick = () => {
    changeColumn(workspace.id, project.id, {
      createTaskForm: !createTaskForm,
    });
  };

  if (minimized) return null;

  return (
    <>
      <div className="grow hidden sm:block" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="max-sm:hidden" aria-label="Workspace options">
            <EllipsisVertical size={16} />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="min-w-48" align="end">
          <DropdownMenuItem onClick={() => openProjectConfigSheet(project)} className="flex items-center gap-2">
            {role === 'admin' ? <Settings size={16} /> : <Users size={16} />}
            <span>{role === 'admin' ? t('common:resource_settings', { resource: t('app:project') }) : t('app:project_members')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={minimizeClick} className="hidden  sm:flex items-center gap-2">
            <Minimize2 size={16} />
            <span>{t('common:minimize')}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="plain" size="xs" className="rounded hidden sm:inline-flex" onClick={createTaskClick}>
        <Plus size={18} className={`${createTaskForm ? 'rotate-45' : ''} transition-transform duration-200 `} />
        <span className="ml-1">{t('app:task')}</span>
      </Button>
      <div className="grow sm:hidden" />
    </>
  );
};

export default ProjectActions;
