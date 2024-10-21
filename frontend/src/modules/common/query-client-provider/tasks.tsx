import { type QueryKey, useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';
import { type GetTasksParams, createTask, updateTask } from '~/api/tasks';
import { queryClient } from '~/lib/router';
import type { Subtask, Task } from '~/types/app';
import { nanoid } from '~/utils/nanoid';

export type TasksCreateMutationQueryFnVariables = Parameters<typeof createTask>[0];
type TasksUpdateParams = Parameters<typeof updateTask>[0];
export type TasksUpdateMutationQueryFnVariables = Omit<TasksUpdateParams, 'data'> & {
  projectId?: string;
  data: TasksUpdateParams['data'] | { id: string }[];
};
// export type TasksDeleteMutationQueryFnVariables = Parameters<typeof deleteTasks>[0] & {
//   projectId?: string;
// };

type InfiniteQueryFnData = {
  items: Task[];
  total: number;
};

export const taskKeys = {
  all: () => ['tasks'] as const,
  lists: () => [...taskKeys.all(), 'list'] as const,
  list: (filters?: GetTasksParams) => [...taskKeys.lists(), filters] as const,
  create: () => [...taskKeys.all(), 'create'] as const,
  update: () => [...taskKeys.all(), 'update'] as const,
  delete: () => [...taskKeys.all(), 'delete'] as const,
};

const transformUpdateData = (variables: TasksUpdateMutationQueryFnVariables) => {
  const transformedVariables = {
    ...variables,
    data: Array.isArray(variables.data) ? variables.data.map((item) => (typeof item === 'string' ? item : item.id)) : variables.data,
  };

  return transformedVariables;
};

export const useTaskCreateMutation = () => {
  return useMutation<Task, Error, TasksCreateMutationQueryFnVariables>({
    mutationKey: taskKeys.create(),
    mutationFn: createTask,
  });
};

export const useTaskUpdateMutation = () => {
  return useMutation<Pick<Task, 'summary' | 'description' | 'expandable'>, Error, TasksUpdateMutationQueryFnVariables>({
    mutationKey: taskKeys.update(),
    mutationFn: (variables) => updateTask(transformUpdateData(variables)),
  });
};

// export const useTaskDeleteMutation = () => {
//   return useMutation<boolean, Error, TasksDeleteMutationQueryFnVariables>({
//     mutationKey: taskKeys.delete(),
//     mutationFn: deleteTasks,
//   });
// };

// Helper function to update a task property
const updateTaskProperty = <T extends Task | Subtask>(task: T, variables: TasksUpdateMutationQueryFnVariables): T => {
  return { ...task, [variables.key]: variables.data };
};

// Helper function to update a subtask within the parent
const updateSubtasks = (subtasks: Subtask[], taskId: string, variables: TasksUpdateMutationQueryFnVariables) => {
  return subtasks.map((subtask) => {
    if (subtask.id === taskId) {
      return updateTaskProperty(subtask, variables); // Update the subtask
    }
    return subtask; // No changes
  });
};

const getPreviousTasks = async (queryKey: QueryKey) => {
  // Cancel any outgoing refetches
  // (so they don't overwrite our optimistic update)
  await queryClient.cancelQueries({ queryKey });
  // Snapshot the previous value
  const previousTasks = queryClient.getQueryData<InfiniteQueryFnData>(queryKey);

  return previousTasks;
};

const onError = (
  _: Error,
  { organizationId, projectId, orgIdOrSlug }: TasksUpdateMutationQueryFnVariables & TasksCreateMutationQueryFnVariables,
  context?: { previousTasks?: InfiniteQueryFnData },
) => {
  orgIdOrSlug = organizationId || orgIdOrSlug;
  if (context?.previousTasks && orgIdOrSlug && projectId) {
    queryClient.setQueryData(taskKeys.list({ orgIdOrSlug, projectId }), context.previousTasks);
  }
  toast.error(t('common:error.create_resource', { resource: t('app:task') }));
};

queryClient.setMutationDefaults(taskKeys.create(), {
  mutationFn: createTask,
  onMutate: async (variables) => {
    const { id: taskId, organizationId, projectId, parentId, impact } = variables;

    const optimisticId = taskId || nanoid();
    const newTask: Task = {
      ...variables,
      id: optimisticId,
      impact: impact || null,
      expandable: false,
      parentId: parentId || null,
      labels: [],
      subtasks: [],
      entity: 'task',
      assignedTo: [],
      createdAt: new Date().toISOString(),
      createdBy: null,
      modifiedAt: new Date().toISOString(),
      modifiedBy: null,
    };

    const queryKey = taskKeys.list({ orgIdOrSlug: organizationId, projectId });
    const previousTasks = await getPreviousTasks(queryKey);

    // Optimistically update to the new value
    if (previousTasks) {
      queryClient.setQueryData<InfiniteQueryFnData>(queryKey, (old) => {
        if (!old) {
          return {
            items: [],
            total: 0,
          };
        }

        const updatedTasks = old.items.map((task) => {
          // Update the parent task
          if (task.id === parentId) {
            const t = { ...task, subtasks: [...task.subtasks, newTask] };
            return t;
          }

          // No changes, return task as-is
          return task;
        });

        // Add the new task to the list
        updatedTasks.push(newTask);

        return {
          ...old,
          items: updatedTasks,
        };
      });
    }

    // Return a context object with the snapshotted value
    return { previousTasks, optimisticId };
  },
  onSuccess: (createdTask, { organizationId, projectId }, { optimisticId }) => {
    queryClient.setQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug: organizationId, projectId }), (oldData) => {
      if (!oldData) {
        return {
          items: [],
          total: 0,
        };
      }

      const updatedTasks = oldData.items.map((task) => {
        // Update the task itself
        if (task.id === optimisticId) {
          return createdTask;
        }

        // If the task is the parent, update its subtasks
        if (task.subtasks) {
          const updatedSubtasks = task.subtasks.map((subtask) => (subtask.id === optimisticId ? createdTask : subtask));
          return { ...task, subtasks: updatedSubtasks }; // Return parent with updated subtasks
        }

        // No changes, return task as-is
        return task;
      });

      return {
        ...oldData,
        items: updatedTasks,
      };
    });
    toast.success(t('common:success.create_resource', { resource: t('app:task') }));
  },
  onError,
});

queryClient.setMutationDefaults(taskKeys.update(), {
  mutationFn: (variables) => updateTask(transformUpdateData(variables)),
  onMutate: async (variables: TasksUpdateMutationQueryFnVariables) => {
    const { id: taskId, orgIdOrSlug, projectId } = variables;
    const queryKey = taskKeys.list({ orgIdOrSlug, projectId });
    const previousTasks = await getPreviousTasks(queryKey);

    // Optimistically update to the new value
    if (previousTasks) {
      queryClient.setQueryData<InfiniteQueryFnData>(queryKey, (old) => {
        if (!old) {
          return {
            items: [],
            total: 0,
          };
        }

        const updatedTasks = old.items.map((task) => {
          // Update the task itself
          if (task.id === taskId) {
            const t = updateTaskProperty(task, variables);
            if (variables.order && variables.order !== t.order) t.order = variables.order;
            return t;
          }

          // If the task is the parent, update its subtasks
          if (task.subtasks) {
            //TODO maybe sort in some other way
            const updatedSubtasks = updateSubtasks(task.subtasks, taskId, variables);
            return { ...task, subtasks: updatedSubtasks.sort((a, b) => b.order - a.order) }; // Return parent with updated subtasks
          }

          // No changes, return task as-is
          return task;
        });

        return {
          ...old,
          items: updatedTasks,
        };
      });
    }

    // Return a context object with the snapshotted value
    return { previousTasks };
  },
  onSuccess: (updatedTask, { id: taskId, orgIdOrSlug, projectId }) => {
    queryClient.setQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug, projectId }), (oldData) => {
      if (!oldData) {
        return {
          items: [],
          total: 0,
        };
      }

      const updatedTasks = oldData.items.map((task) => {
        // Update the task itself
        if (task.id === taskId) {
          return {
            ...task,
            ...updatedTask,
          };
        }

        // If the task is the parent, update its subtasks
        if (task.subtasks) {
          const updatedSubtasks = task.subtasks.map((subtask) =>
            subtask.id === taskId
              ? {
                  ...subtask,
                  ...updatedTask,
                }
              : subtask,
          );
          return { ...task, subtasks: updatedSubtasks }; // Return parent with updated subtasks
        }

        // No changes, return task as-is
        return task;
      });

      return {
        ...oldData,
        items: updatedTasks,
      };
    });
  },
  onError,
});

// queryClient.setMutationDefaults(taskKeys.delete(), {
//   mutationFn: (variables: TasksDeleteMutationQueryFnVariables) => deleteTasks(variables),
//   onMutate: async (variables) => {
//     const { ids, projectId, orgIdOrSlug } = variables;

//     // Cancel any outgoing refetches
//     // (so they don't overwrite our optimistic update)
//     await queryClient.cancelQueries({ queryKey: taskKeys.list({ orgIdOrSlug, projectId }) });
//     // Snapshot the previous value
//     const previousTasks = queryClient.getQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug, projectId }));

//     // Optimistically update to the new value
//     if (previousTasks) {
//       queryClient.setQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug, projectId }), (old) => {
//         if (!old) {
//           return {
//             items: [],
//             total: 0,
//           };
//         }

//         const updatedTasks = old.items
//           .map((task) => {
//             // Update the task itself
//             if (ids.includes(task.id)) {
//               return null;
//             }

//             // If the task is the parent, update its subtasks
//             if (task.subtasks) {
//               const updatedSubtasks = task.subtasks.filter((subtask) => !ids.includes(subtask.id));
//               return { ...task, subtasks: updatedSubtasks }; // Return parent with updated subtasks
//             }

//             // No changes, return task as-is
//             return task;
//           })
//           .filter(Boolean) as Task[];

//         return {
//           ...old,
//           items: updatedTasks,
//         };
//       });
//     }

//     // Return a context object with the snapshotted value
//     return { previousTasks };
//   },
//   onError: (_, { orgIdOrSlug, projectId }, context) => {
//     if (context?.previousTasks) {
//       queryClient.setQueryData(taskKeys.list({ orgIdOrSlug, projectId }), context.previousTasks);
//     }
//   },
// });
