import type { AppProjectsType } from 'backend/modules/projects/index';
import { config } from 'config';
import { hc } from 'hono/client';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = hc<AppProjectsType>(`${config.backendUrl}/projects`, clientConfig);

export type CreateProjectParams = Parameters<(typeof client.index)['$post']>['0']['json'] & {
  organizationId: string;
};

// Create a new project
export const createProject = async (workspaceId: string, { ...rest }: CreateProjectParams) => {
  const response = await client.index.$post({
    query: { workspaceId },
    json: rest,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get an project by its slug or ID
export const getProject = async (idOrSlug: string) => {
  const response = await client[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetProjectsParams = Partial<
  Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit?: number;
    offset?: number;
    page?: number;
  }
>;

// Get a list of projects
export const getProjects = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50, organizationId, userId, offset }: GetProjectsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
        limit: String(limit),
        organizationId,
        userId,
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

export type UpdateProjectParams = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

// Update a project
export const updateProject = async (idOrSlug: string, params: UpdateProjectParams) => {
  const response = await client[':idOrSlug'].$put({
    param: { idOrSlug },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete projects
export const deleteProjects = async (ids: string[]) => {
  const response = await client.index.$delete({
    query: { ids },
  });

  await handleResponse(response);
};
