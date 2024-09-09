import { type InfiniteData, type QueryKey, useQueryClient } from '@tanstack/react-query';
import type { TaskQueryActions } from '~/lib/custom-events/types';
import { queryClient } from '~/lib/router';
import type { Project, SubTask, Task, Workspace } from '~/types/app';
import type { Membership } from '~/types/common';

interface Item {
  id: string;
  membership?: { id: string } | null;
}

// This hook is used to mutate the data of a query
export const useMutateQueryData = (queryKey: QueryKey) => {
  return (items: Item[], action: 'create' | 'update' | 'delete') => {
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

function assertProjects(items: Item[]): asserts items is Project[] {
  if (!items.length) throw new Error('No items provided');
  if (!('entity' in items[0])) throw new Error('Not a project');
}

function assertWorkspaces(items: Item[]): asserts items is Workspace[] {
  if (!items.length) throw new Error('No items provided');
  if (!('entity' in items[0])) throw new Error('Not a workspace');
}

function assertMemberships(items: Item[]): asserts items is Membership[] {
  if (!items.length) throw new Error('No items provided');
  if (!('entity' in items[0])) throw new Error('Not a membership');
}

export const useMutateWorkSpaceQueryData = (queryKey: QueryKey) => {
  const queryClient = useQueryClient();
  return (
    items: (Workspace | Project | Membership)[],
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
      projects: Project[];
    }>(queryKey, (data) => {
      if (!data) return data;
      switch (action) {
        case 'createProject':
          assertProjects(items);
          return {
            ...data,
            projects: [...items, ...data.projects],
          };

        case 'updateProject':
          assertProjects(items);
          return {
            ...data,
            projects: data.projects.map((existingProject) => {
              const updatedItem = items.find((newProject) => existingProject.id === newProject.id);
              return updatedItem ? updatedItem : existingProject;
            }),
          };

        case 'deleteProject':
          assertProjects(items);
          return {
            ...data,
            projects: data.projects.filter((existingProject) => !items.find((item) => item.id === existingProject.id)),
          };

        case 'updateWorkspace':
          assertWorkspaces(items);
          return {
            ...data,
            workspace: items[0],
          };

        case 'updateWorkspaceMembership':
          assertMemberships(items);
          return {
            ...data,
            workspace: {
              ...data.workspace,
              membership: {
                ...data.workspace.membership,
                ...items[0],
              },
            },
          };

        case 'updateProjectMembership': {
          assertMemberships(items);
          const updatedMembership = items[0];
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
          assertMemberships(items);
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

export const useMutateTasksQueryData = (queryKey: QueryKey) => {
  return (newItems: Task[] | SubTask[] | { id: string }[], action: TaskQueryActions) => {
    queryClient.setQueryData<{
      items: Task[];
      total: number;
    }>(queryKey, (data) => {
      if (!data) return;

      if (action === 'create') {
        const [newTask] = newItems as Task[];
        if (newTask.projectId !== queryKey[1]) return;
        return {
          items: [newTask, ...data.items],
          total: data.total + newItems.length,
        };
      }

      if (action === 'update') {
        return {
          items: data.items.map((prevItem) => {
            const updatedItem = (newItems as Task[]).find((el) => el.id === prevItem.id);
            return updatedItem || prevItem;
          }),
          total: data.total,
        };
      }

      if (action === 'delete') {
        const updatedItems = data.items.filter((item) => !(newItems as { id: string }[]).some((deletedItem) => deletedItem.id === item.id));
        const updatedTotal = data.total - (data.items.length - updatedItems.length);
        return {
          items: updatedItems,
          total: updatedTotal,
        };
      }

      if (action === 'createSubTask') {
        return {
          items: data.items.map((currentItem) => {
            const newSubTask = newItems[0] as SubTask;
            if (currentItem.id === newSubTask.parentId) {
              return {
                ...currentItem,
                subTasks: [...currentItem.subTasks, newSubTask],
              };
            }
            return currentItem;
          }),
          total: data.total,
        };
      }

      if (action === 'updateSubTask') {
        return {
          items: data.items.map((currentItem) => ({
            ...currentItem,
            subTasks: currentItem.subTasks.map((subTask) => {
              const updatedSubTask = (newItems as SubTask[]).find((el) => el.id === subTask.id);
              return updatedSubTask || subTask;
            }),
          })),
          total: data.total,
        };
      }

      if (action === 'deleteSubTask') {
        return {
          items: data.items.map((currentItem) => ({
            ...currentItem,
            subTasks: currentItem.subTasks.filter((subTask) => !(newItems as { id: string }[]).some((deletedItem) => deletedItem.id === subTask.id)),
          })),
          total: data.total,
        };
      }
    });
  };
};

export const useMutateInfiniteTaskQueryData = (queryKey: QueryKey, invalidateKeyGetter?: (item: Item) => QueryKey) => {
  return (newItems: Task[] | SubTask[] | { id: string }[], action: TaskQueryActions) => {
    queryClient.setQueryData<
      InfiniteData<{
        items: Task[];
        total: number;
      }>
    >(queryKey, (data) => {
      if (!data) return;

      if (action === 'create') {
        return {
          pages: [
            {
              items: [...(newItems as Task[]), ...data.pages[0].items],
              total: data.pages[0].total + newItems.length,
            },
            ...data.pages.slice(1),
          ],
          pageParams: data.pageParams,
        };
      }

      if (action === 'update') {
        const updatedPages = data.pages.map((page) => ({
          items: page.items.map((item) => {
            const updatedItem = (newItems as Task[]).find((el) => el.id === item.id);
            if (item.id === updatedItem?.id) return updatedItem;
            return item;
          }),
          total: page.total,
        }));

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }

      if (action === 'delete') {
        const updatedPages = data.pages.map((page) => {
          const updatedItems = page.items.filter((item) => !(newItems as { id: string }[]).some((deletedItem) => deletedItem.id === item.id));
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

      if (action === 'createSubTask') {
        const updatedPages = data.pages.map((page) => ({
          items: page.items.map((currentItem) => {
            const newSubTask = newItems[0] as SubTask;
            if (currentItem.id === newSubTask.parentId) {
              return {
                ...currentItem,
                subTasks: [...currentItem.subTasks, newSubTask],
              };
            }
            return currentItem;
          }),
          total: page.total,
        }));
        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }

      if (action === 'updateSubTask') {
        const updatedPages = data.pages.map((page) => ({
          items: page.items.map((currentItem) => ({
            ...currentItem,
            subTasks: currentItem.subTasks.map((subTask) => {
              const updatedSubTask = (newItems as SubTask[]).find((el) => el.id === subTask.id);
              if (subTask.id === updatedSubTask?.id) return updatedSubTask;
              return subTask;
            }),
          })),
          total: page.total,
        }));

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }

      if (action === 'deleteSubTask') {
        const updatedPages = data.pages.map((page) => ({
          items: page.items.map((currentItem) => ({
            ...currentItem,
            subTasks: currentItem.subTasks.filter((subTask) => !(newItems as SubTask[]).some((deletedItem) => deletedItem.id === subTask.id)),
          })),
          total: page.total,
        }));

        return {
          pages: updatedPages,
          pageParams: data.pageParams,
        };
      }
    });

    if (invalidateKeyGetter) {
      for (const item of newItems) {
        queryClient.invalidateQueries({
          queryKey: invalidateKeyGetter(item as Item),
        });
      }
    }
  };
};
