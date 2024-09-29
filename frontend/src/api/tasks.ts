import { config } from 'config';
import { tasksHc } from '#/modules/tasks/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = tasksHc(config.backendUrl, clientConfig);

type CreateTaskParams = Parameters<(typeof client.index)['$post']>['0']['json'];

// Create a new task
export const createTask = async (task: CreateTaskParams) => {
  const response = await client.index.$post({
    param: { orgIdOrSlug: task.organizationId },
    json: task,
  });
  const json = await handleResponse(response);
  return json.data;
};

export type GetTasksParams = Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  orgIdOrSlug: string;
  limit?: number;
  offset?: number;
  page?: number;
};

// Get list of tasks
export const getTasksList = async (
  { q, sort = 'createdAt', order = 'asc', page = 0, limit = 1000, offset, projectId, orgIdOrSlug, status }: GetTasksParams,
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      param: { orgIdOrSlug },
      query: {
        q,
        sort,
        order,
        projectId,
        status,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
        limit: String(limit),
      },
    },
    {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          credentials: 'include',
          signal,
        });
      },
    },
  );

  const json = await handleResponse(response);
  return json.data;
};

// Get a task by its ID
export const getTask = async (id: string, orgIdOrSlug: string) => {
  const response = await client[':id'].$get({
    param: { id, orgIdOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type UpdateTaskParams = Parameters<(typeof client)[':id']['$put']>['0']['json'];

// Update task by its ID
export const updateTask = async (
  id: string,
  orgIdOrSlug: string,
  key: string,
  data: string | string[] | number | null | boolean,
  order?: number | null,
) => {
  const newOrder = order || null;
  const response = await client[':id'].$put({
    param: { id, orgIdOrSlug },
    json: {
      key,
      data,
      order: newOrder,
    },
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete tasks
export const deleteTasks = async (ids: string[], orgIdOrSlug: string) => {
  const response = await client.index.$delete({
    param: { orgIdOrSlug },
    query: { ids },
  });
  const json = await handleResponse(response);
  return json.success;
};
