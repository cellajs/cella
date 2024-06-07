import { projectsClient as client, handleResponse } from '.';

export type CreateProjectParams = Parameters<(typeof client.index)['$post']>['0']['json'] & {
  organization: string;
};

// Create a new project
export const createProject = async ({ organization, ...rest }: CreateProjectParams) => {
  const response = await client.index.$post({
    param: { organization },
    json: rest,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get an project by its slug or ID
export const getProjectBySlugOrId = async (project: string) => {
  const response = await client[':project'].$get({
    param: { project },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetProjectsParams = Partial<
  Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of projects
export const getProjects = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50, workspace, organization }: GetProjectsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
        limit: String(limit),
        workspace,
        organization,
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

export type UpdateProjectParams = Parameters<(typeof client)[':project']['$put']>['0']['json'];

// Update a project
export const updateProject = async (project: string, params: UpdateProjectParams) => {
  const response = await client[':project'].$put({
    param: { project },
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
