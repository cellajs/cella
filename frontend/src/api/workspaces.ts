import { workspacesClient as client, handleResponse } from '.';

export type CreateWorkspaceParams = Parameters<(typeof client.index)['$post']>['0']['json'] & {
  organization: string;
};

// Create new workspace
export const createWorkspace = async ({ organization, ...rest }: CreateWorkspaceParams) => {
  const response = await client.index.$post({
    param: { organization },
    json: rest,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get workspace by its slug or ID
export const getWorkspaceBySlugOrId = async (workspace: string) => {
  const response = await client[':workspace'].$get({
    param: { workspace },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type UpdateWorkspaceParams = Parameters<(typeof client)[':workspace']['$put']>['0']['json'];

// Update workspace
export const updateWorkspace = async (workspace: string, params: UpdateWorkspaceParams) => {
  const response = await client[':workspace'].$put({
    param: { workspace },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete workspaces
export const deleteWorkspaces = async (ids: string[]) => {
  const response = await client.index.$delete({
    query: { ids },
  });

  await handleResponse(response);
};
