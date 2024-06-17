import { lazy } from 'react';
import { useSearch } from '@tanstack/react-router';

import { WorkspaceRoute } from '~/routes/workspaces';
import { ProjectSettings } from './project-settings';
import type { Project } from '~/types';

const MembersTable = lazy(() => import('~/modules/organizations/members-table'));

export const ProjectSheet = ({ project }: { project: Project }) => {
  const { projectSettings } = useSearch({ from: WorkspaceRoute.id });

  return (
    <div className="flex flex-col gap-8">
      {projectSettings === 'members' ? (
        <MembersTable focus={false} idOrSlug={project.id} route={WorkspaceRoute.id} entityType={'PROJECT'} />
      ) : (
        <ProjectSettings project={project} sheet />
      )}
    </div>
  );
};
