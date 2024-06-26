import { apiClient, handleResponse } from '.';

const client = apiClient.projects;

export type CreateProjectParams = Parameters<(typeof client)['$post']>['0']['json'] & {
  organizationId: string;
};

// Create a new project
export const createProject = async (workspaceId: string, { ...rest }: CreateProjectParams) => {
  const response = await client.$post({
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
  Omit<Parameters<(typeof client)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit?: number;
    offset?: number;
    page?: number;
  }
>;

// Get a list of projects
export const getProjects = async (
  {
    q,
    sort = 'id',
    order = 'asc',
    page = 0,
    limit = 50,
    workspaceId,
    organizationId,
    requestedUserId,
  }: GetProjectsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
        limit: String(limit),
        workspaceId,
        organizationId,
        requestedUserId,
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
  const response = await client.$delete({
    query: { ids },
  });

  await handleResponse(response);
};
