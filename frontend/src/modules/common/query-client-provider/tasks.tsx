import { useMutation } from '@tanstack/react-query';
import { t } from 'i18next';
import { toast } from 'sonner';
import { type GetTasksParams, createTask, updateTask } from '~/api/tasks';
import { queryClient } from '~/lib/router';
import { sortSubtaskOrder } from '~/modules/tasks/helpers';
import type { Label, Subtask, Task } from '~/types/app';
import type { LimitedUser } from '~/types/common';
import { nanoid } from '~/utils/nanoid';

export type TasksCreateMutationQueryFnVariables = Parameters<typeof createTask>[0];
export type TasksUpdateMutationQueryFnVariables = Omit<Parameters<typeof updateTask>[0], 'data'> & {
  projectId?: string;
  data: string | number | boolean | string[] | Label[] | LimitedUser[] | null;
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

export const useTaskCreateMutation = () => {
  return useMutation<Task, Error, TasksCreateMutationQueryFnVariables>({
    mutationKey: taskKeys.create(),
    mutationFn: createTask,
  });
};

export const useTaskUpdateMutation = () => {
  return useMutation<Pick<Task, 'summary' | 'description' | 'expandable'>, Error, TasksUpdateMutationQueryFnVariables>({
    mutationKey: taskKeys.update(),
    mutationFn: (variables: TasksUpdateMutationQueryFnVariables) => {
      const transformedVariables = {
        ...variables,
        data: Array.isArray(variables.data) ? variables.data.map((item) => (typeof item === 'string' ? item : item.id)) : variables.data,
      };
      return updateTask(transformedVariables);
    },
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

queryClient.setMutationDefaults(taskKeys.create(), {
  mutationFn: createTask,
  onMutate: async (variables) => {
    const { id: taskId, organizationId, projectId, parentId, impact } = variables;

    const newTask: Task = {
      ...variables,
      id: taskId || nanoid(),
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

    // Cancel any outgoing refetches
    // (so they don't overwrite our optimistic update)
    await queryClient.cancelQueries({ queryKey: taskKeys.list({ orgIdOrSlug: organizationId, projectId }) });
    // Snapshot the previous value
    const previousTasks = queryClient.getQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug: organizationId, projectId }));

    // Optimistically update to the new value
    if (previousTasks) {
      queryClient.setQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug: organizationId, projectId }), (old) => {
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
    return { previousTasks };
  },
  onSuccess: (createdTask, { id: taskId, organizationId, projectId }) => {
    queryClient.setQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug: organizationId, projectId }), (oldData) => {
      if (!oldData) {
        return {
          items: [],
          total: 0,
        };
      }

      const updatedTasks = oldData.items.map((task) => {
        // Update the task itself
        if (task.id === taskId) {
          return createdTask;
        }

        // If the task is the parent, update its subtasks
        if (task.subtasks) {
          const updatedSubtasks = task.subtasks.map((subtask) => (subtask.id === taskId ? createdTask : subtask));
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
  onError: (_, { organizationId, projectId }, context) => {
    if (context?.previousTasks) {
      queryClient.setQueryData(taskKeys.list({ orgIdOrSlug: organizationId, projectId }), context.previousTasks);
    }
    toast.error(t('common:error.create_resource', { resource: t('app:task') }));
  },
});

queryClient.setMutationDefaults(taskKeys.update(), {
  mutationFn: (variables: TasksUpdateMutationQueryFnVariables) => {
    const { data } = variables;
    // Transform data only if key is 'labels' of 'assignTo' and data is an array
    const transformedData = Array.isArray(data) ? data.map((el) => (typeof el === 'string' ? el : el.id)) : data;
    const transformedVariables = {
      ...variables,
      data: transformedData,
    };

    // Send transformed variables to the server
    return updateTask(transformedVariables);
  },

  onMutate: async (variables) => {
    const { id: taskId, orgIdOrSlug, projectId } = variables;

    // Cancel any outgoing refetches
    // (so they don't overwrite our optimistic update)
    await queryClient.cancelQueries({ queryKey: taskKeys.list({ orgIdOrSlug, projectId }) });
    // Snapshot the previous value
    const previousTasks = queryClient.getQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug, projectId }));

    // Optimistically update to the new value
    if (previousTasks) {
      queryClient.setQueryData<InfiniteQueryFnData>(taskKeys.list({ orgIdOrSlug, projectId }), (old) => {
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
            return t;
          }

          // If the task is the parent, update its subtasks
          if (task.subtasks) {
            //TODO maybe sort in some other way
            const updatedSubtasks = updateSubtasks(task.subtasks, taskId, variables);
            return { ...task, subtasks: updatedSubtasks.sort((a, b) => sortSubtaskOrder(a, b)) }; // Return parent with updated subtasks
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
  onError: (_, { orgIdOrSlug, projectId }, context) => {
    if (context?.previousTasks) {
      queryClient.setQueryData(taskKeys.list({ orgIdOrSlug, projectId }), context.previousTasks);
    }
  },
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
