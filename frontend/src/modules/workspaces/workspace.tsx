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

export const workspaceQueryOptions = (resourceIdentifier: string) =>
  queryOptions({
    queryKey: ['workspaces', resourceIdentifier],
    queryFn: () => getWorkspaceBySlugOrId(resourceIdentifier),
  });

const WorkspacePage = () => {
  const { resourceIdentifier } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(resourceIdentifier));
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
