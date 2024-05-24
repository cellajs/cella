import { projectClient as client, handleResponse } from '.';

export type CreateProjectParams = Parameters<(typeof client.workspaces)[':workspace']['projects']['$post']>['0']['json'] & {
  workspace: string;
};

// Create a new project
export const createProject = async ({ workspace, ...rest }: CreateProjectParams) => {
  const response = await client.workspaces[':workspace'].projects.$post({
    param: { workspace },
    json: rest,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get an project by its slug or ID
export const getProjectBySlugOrId = async (project: string) => {
  const response = await client.projects[':project'].$get({
    param: { project },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetProjectsParams = Partial<
  Omit<Parameters<(typeof client.projects)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of projects
export const getProjects = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50, workspace }: GetProjectsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.projects.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
        limit: String(limit),
        workspace,
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

export type UpdateProjectParams = Parameters<(typeof client.projects)[':project']['$put']>['0']['json'];

// Update a project
export const updateProject = async (project: string, params: UpdateProjectParams) => {
  const response = await client.projects[':project'].$put({
    param: { project },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete projects
export const deleteProjects = async (ids: string[]) => {
  const response = await client.projects.$delete({
    query: { ids },
  });

  await handleResponse(response);
};
