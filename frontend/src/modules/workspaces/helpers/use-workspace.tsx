import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { queryClient } from '~/lib/router';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Project, Workspace } from '~/types/app';
import { workspaceQueryOptions } from './query-options';

export const useWorkspaceQuery = () => {
  const { idOrSlug, orgIdOrSlug } = useParams({ from: WorkspaceRoute.id });
  const queryOptions = workspaceQueryOptions(idOrSlug, orgIdOrSlug);
  const result = useSuspenseQuery(queryOptions);

  const updateWorkspace = (workspace: Workspace) => {
    queryClient.setQueryData(queryOptions.queryKey, {
      ...result.data,
      workspace,
    });
  };

  const addProject = (project: Project) => {
    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      if (!data) return;
      return {
        ...data,
        projects: [...data.projects, project],
      };
    });
  };

  const updateProject = (project: Project) => {
    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      if (!data) return;
      return {
        ...data,
        projects: data.projects.map((p) => {
          if (p.id === project.id) {
            return project;
          }
          return p;
        }),
      };
    });
  };

  const removeProjects = (projectIds: string[]) => {
    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      if (!data) return;
      return {
        ...data,
        projects: data.projects.filter((project) => !projectIds.includes(project.id)),
      };
    });
  };

  return {
    ...result,
    updateWorkspace,
    addProject,
    updateProject,
    removeProjects,
  };
};
