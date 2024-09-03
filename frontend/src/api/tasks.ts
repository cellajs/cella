import { apiClient, handleResponse } from '.';

const client = apiClient.tasks;

type CreateTaskParams = Parameters<(typeof client)['$post']>['0']['json'];

// Create a new task
export const createTask = async (task: CreateTaskParams) => {
  const response = await client.$post({ json: task });
  const json = await handleResponse(response);
  return json.data;
};

export type GetTasksParams = Omit<Parameters<(typeof client)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Get list of tasks
export const getTasksList = async (
  { q, sort = 'createdAt', order = 'asc', page = 0, limit = 1000, offset, projectId, status }: GetTasksParams,
  signal?: AbortSignal,
) => {
  const response = await client.$get(
    {
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
export const getTask = async (id: string) => {
  const response = await client[':id'].$get({
    param: { id },
  });

  const json = await handleResponse(response);
  return json.data;
};

// Update task by its ID
export const updateTask = async (id: string, key: string, data: string | string[] | number | null | boolean, order?: number | null) => {
  const newOrder = order || null;
  const response = await client[':id'].$put({
    param: { id },
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
export const deleteTasks = async (ids: string[]) => {
  const response = await client.$delete({
    query: { ids },
  });
  const json = await handleResponse(response);
  return json.success;
};
