import { useQueryClient, type InfiniteData, type QueryKey } from '@tanstack/react-query';
import { queryClient } from '~/lib/router';
import type { Workspace, WorkspaceStoreProject, Membership, Project } from '~/types';

interface Item {
  id: string;
  membership?: { id: string } | null;
}

// This hook is used to mutate the data of a query
export const useMutateQueryData = (queryKey: QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete' | 'updateMembership') => {
    queryClient.setQueryData<{
      items: Item[];
      total: number;
    }>(queryKey, (data) => {
      if (!data) return;

      if (action === 'create') {
        return {
          items: [...items, ...data.items],
          total: data.total + items.length,
        };
      }

      if (action === 'update') {
        return {
          items: data.items.map((item) => {
            const updatedItem = items.find((items) => items.id === item.id);
            if (item.id === updatedItem?.id) {
              return updatedItem;
            }
            return item;
          }),
          total: data.total,
        };
      }

      if (action === 'delete') {
        const updatedItems = data.items.filter((item) => !items.some((deletedItem) => deletedItem.id === item.id));
        const updatedTotal = data.total - (data.items.length - updatedItems.length);
        return {
          items: updatedItems,
          total: updatedTotal,
        };
      }

      if (action === 'updateMembership') {
        return {
          items: data.items.map((item) => {
            const updatedItem = items.find((items) => item.membership && items.id === item.membership.id);
            if (item.membership && item.membership.id === updatedItem?.id) {
              return { ...item, membership: { ...item.membership, ...updatedItem } };
            }
            return item;
          }),
          total: data.total,
        };
      }
    });
  };
};

// This hook is used to mutate the data of an infinite query
export const useMutateInfiniteQueryData = (queryKey: QueryKey, invalidateKeyGetter?: (item: Item) => QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete' | 'updateMembership') => {
    queryClient.setQueryData<
      InfiniteData<{
        items: Item[];
        total: number;
      }>
    >(queryKey, (data) => {
      if (!data) return;
      if (action === 'create') {
        return {
          pages: [
            {
              items: [...items, ...data.pages[0].items],
              total: data.pages[0].total + items.length,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'update') {
        const updatedPages = data.pages.map((page) => {
          return {
            items: page.items.map((item) => {
              const updatedItem = items.find((items) => items.id === item.id);
              if (item.id === updatedItem?.id) return updatedItem;
              return item;
            }),
            total: page.total,
          };
        });

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }

      if (action === 'delete') {
        const updatedPages = data.pages.map((page) => {
          const updatedItems = page.items.filter((item) => !items.some((deletedItem) => deletedItem.id === item.id));
          const updatedTotal = page.total - (page.items.length - updatedItems.length);
          return {
            items: updatedItems,
            total: updatedTotal,
          };
        });

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }

      if (action === 'updateMembership') {
        const updatedPages = data.pages.map((page) => {
          return {
            items: page.items.map((item) => {
              const updatedItem = items.find((items) => item.membership && items.id === item.membership.id);
              if (item.membership && item.membership.id === updatedItem?.id) {
                return { ...item, membership: { ...item.membership, ...updatedItem } };
              }
              return item;
            }),
            total: page.total,
          };
        });

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }
    });

    if (invalidateKeyGetter) {
      for (const item of items) {
        queryClient.invalidateQueries({
          queryKey: invalidateKeyGetter(item),
        });
      }
    }
  };
};

export const useMutateWorkSpaceQueryData = (queryKey: QueryKey) => {
  const queryClient = useQueryClient();
  return (
    items: Workspace[] | Project[] | Membership[],
    action:
      | 'createProject'
      | 'updateProject'
      | 'deleteProject'
      | 'updateWorkspace'
      | 'updateProjectMembership'
      | 'updateWorkspaceMembership'
      | 'updateMembers',
  ) => {
    queryClient.setQueryData<{
      workspace: Workspace;
      projects: WorkspaceStoreProject[];
    }>(queryKey, (data) => {
      if (!data) return data;
      switch (action) {
        case 'createProject':
          return {
            ...data,
            projects: [...(items as unknown as WorkspaceStoreProject[]), ...data.projects],
          };

        case 'updateProject':
          return {
            ...data,
            projects: data.projects.map((existingProject) => {
              const updatedItem = (items as unknown as WorkspaceStoreProject[]).find((newProject) => existingProject.id === newProject.id);
              return updatedItem ? { ...updatedItem, ...{ members: existingProject.members } } : existingProject;
            }),
          };

        case 'deleteProject':
          return {
            ...data,
            projects: data.projects.filter((existingProject) => !items.find((item) => item.id === existingProject.id)),
          };

        case 'updateWorkspace':
          return {
            ...data,
            workspace: items[0] as Workspace,
          };

        case 'updateWorkspaceMembership':
          return {
            ...data,
            workspace: {
              ...data.workspace,
              membership: {
                ...data.workspace.membership,
                ...(items[0] as Membership),
              },
            },
          };

        case 'updateProjectMembership': {
          const updatedMembership = items[0] as Membership;
          const newProjects = data.projects.map((existing) => ({
            ...existing,
            membership: existing.membership?.id === updatedMembership.id ? { ...existing.membership, ...updatedMembership } : existing.membership,
          }));

          return {
            ...data,
            projects: newProjects.filter((p) => !p.membership?.archived).sort((a, b) => (a.membership?.order ?? 0) - (b.membership?.order ?? 0)),
          };
        }

        case 'updateMembers': {
          return {
            ...data,
            projects: {
              ...data.projects,
              ...{ members: items },
            },
          };
        }

        default:
          return data;
      }
    });
  };
};
