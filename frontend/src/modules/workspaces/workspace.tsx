import { queryOptions, useSuspenseQuery } from '@tanstack/react-query';
import { Outlet, useParams } from '@tanstack/react-router';
import { createContext, useEffect, useState } from 'react';
import { getWorkspaceBySlugOrId } from '~/api/workspaces';
import { enableMocking, stopMocking } from '~/mocks/browser';
import type { MockResponse } from '~/mocks/dataGeneration';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Workspace } from '~/types';

interface WorkspaceContextValue {
  workspace: Workspace;
  content: MockResponse;
}

export const WorkspaceContext = createContext({} as WorkspaceContextValue);

export const workspaceQueryOptions = (idOrSlug: string) =>
  queryOptions({
    queryKey: ['workspaces', idOrSlug],
    queryFn: () => getWorkspaceBySlugOrId(idOrSlug),
  });

const WorkspacePage = () => {
  const { idOrSlug } = useParams({ from: WorkspaceRoute.id });
  const workspaceQuery = useSuspenseQuery(workspaceQueryOptions(idOrSlug));
  const workspace = workspaceQuery.data;
  const [content, setContent] = useState({} as MockResponse);

  useEffect(() => {
    enableMocking().then(() => {
      fetch('/mock/kanban')
        .then((response) => response.json())
        .then((data) => {
          setContent(data);
          stopMocking();
        })
        .catch((error) => console.error('Error fetching  MSW data:', error));
    });
  }, [idOrSlug]);

  return (
    <WorkspaceContext.Provider value={{ workspace, content }}>
      <Outlet />
    </WorkspaceContext.Provider>
  );
};

export default WorkspacePage;
