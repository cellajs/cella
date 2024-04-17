import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Workspace } from '~/types';

interface WorkspaceContextValue {
  workspace: Workspace;
}

export const WorkspaceContext = createContext({} as WorkspaceContextValue);

export const workspaceQueryOptions = (workspaceIdentifier: string) =>
  queryOptions({
    queryKey: ['workspaces', workspaceIdentifier],
    queryFn: () => getWorkspaceBySlugOrId(workspaceIdentifier),
  });

const WorkspacePage = () => {
  const { workspaceIdentifier } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(workspaceIdentifier));
  const workspace = workspaceQuery.data;

  return (
    <WorkspaceContext.Provider value={{ workspace }}>
      <div className="container min-h-screen mt-4">
        <Outlet />
      </div>
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
