import { workspaceClient as client, handleResponse } from '.';

export type CreateWorkspaceParams = Parameters<(typeof client.workspaces)['$post']>['0']['json'] & {
  organization: string;
};

// Create a new workspace
export const createWorkspace = async ({ organization, ...rest }: CreateWorkspaceParams) => {
  const response = await client.workspaces.$post({
    param: { organization },
    json: rest,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get an workspace by its slug or ID
export const getWorkspaceBySlugOrId = async (workspace: string) => {
  const response = await client.workspaces[':workspace'].$get({
    param: { workspace },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type UpdateWorkspaceParams = Parameters<(typeof client.workspaces)[':workspace']['$put']>['0']['json'];

// Update a workspace
export const updateWorkspace = async (workspace: string, params: UpdateWorkspaceParams) => {
  const response = await client.workspaces[':workspace'].$put({
    param: { workspace },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete workspaces
export const deleteWorkspaces = async (ids: string[]) => {
  const response = await client.workspaces.$delete({
    query: { ids },
  });

  await handleResponse(response);
};
