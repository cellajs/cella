import { ChevronRight, Shrub, SquareMousePointer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Organization } from '~/types';
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group';
import { dialog } from '../common/dialoger/state';
import { CreateProjectForm } from './create-project-form';
import { workspaceQueryOptions } from '../workspaces';
import { useParams } from '@tanstack/react-router';
import { WorkspaceRoute } from '~/routes/workspaces';
import { useSuspenseQuery } from '@tanstack/react-query';

interface AddProjectsProps {
  organization?: Organization | null;
  callback?: () => void;
  dialog?: boolean;
  mode?: string | null;
}

const AddProjects = ({ mode }: AddProjectsProps) => {
  //organization, callback, dialog: isDialog,
  const { t } = useTranslation();

  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;

  const [inviteMode, setInviteMode] = useState(mode);

  const updateMode = (mode: string[]) => {
    mode[0] ? setInviteMode(mode[0]) : setInviteMode(null);

    dialog.update('user-invite', {
      title: mode[0] ? (
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Go back" onClick={() => updateMode([])}>
            {t('common:add_projects')}
          </button>
          <ChevronRight className="opacity-50" size={16} />
          <span>{mode[0] === 'search' ? t('common:select') : t('common:create')}</span>
        </div>
      ) : (
        t('common:add_projects')
      ),
    });
  };

  if (!inviteMode)
    return (
      <ToggleGroup type="multiple" onValueChange={updateMode} className="gap-4 max-sm:flex-col">
        <ToggleGroupItem size="tile" variant="tile" value="email" aria-label="Add by emails">
          <Shrub size={48} strokeWidth={1} />
          <div className="flex flex-col p-4">
            <p className="font-light">{t('common:create_project.text')}</p>
            <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
              <strong>{t('common:continue')}</strong>
              <ChevronRight className="ml-1" size={16} />
            </div>
          </div>
        </ToggleGroupItem>
        <ToggleGroupItem size="tile" variant="tile" value="search" aria-label="Search users">
          <SquareMousePointer size={48} strokeWidth={1} />
          <div className="flex flex-col p-4">
            <div className="font-light">{t('common:select_project.text')}</div>
            <div className="flex items-center flex-row mt-1 opacity-50 transition-opacity group-hover:opacity-100">
              <strong>{t('common:continue')}</strong>
              <ChevronRight className="ml-1" size={16} />
            </div>
          </div>
        </ToggleGroupItem>
      </ToggleGroup>
    );

  if (inviteMode === 'search') {
    return (
      <div className="flex flex-col gap-4">
        {/* <SelectProjectsForm organization={organization} workspace={workspace} callback={callback} dialog={isDialog} /> */}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <CreateProjectForm workspace={workspace} callback={() => {}} dialog />
    </div>
  );
};

export default AddProjects;
