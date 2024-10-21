import { useSuspenseQuery } from '@tanstack/react-query';
import { useParams } from '@tanstack/react-router';
import { queryClient } from '~/lib/router';
import { WorkspaceRoute } from '~/routes/workspaces';
import type { Project, Workspace } from '~/types/app';
import type { Member, Membership } from '~/types/common';
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

  const updateWorkspaceMembership = (membership: Membership) => {
    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      if (!data) return;
      return {
        ...data,
        workspace: { ...data.workspace, membership: { ...data.workspace.membership, ...membership } },
      };
    });
  };

  const addProject = (project: Project, members: Member[]) => {
    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      if (!data) return;
      return {
        ...data,
        projects: [...data.projects, project],
        members: [...data.members, ...members],
      };
    });
  };

  const updateProject = (project: Project) => {
    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      if (!data) return;
      return {
        ...data,
        projects: data.projects.map((p) => {
          if (p.id === project.id) return project;
          return p;
        }),
      };
    });
  };

  const updateProjectMembership = (membership: Membership) => {
    queryClient.setQueryData(queryOptions.queryKey, (data) => {
      if (!data) return;
      return {
        ...data,
        projects: data.projects.map((p) => {
          if (p.membership && p.membership.id === membership.id) return { ...p, membership: { ...p.membership, ...membership } };
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
    updateWorkspaceMembership,
    addProject,
    updateProject,
    updateProjectMembership,
    removeProjects,
  };
};
