import { apiClient, handleResponse } from '.';

const client = apiClient.workspaces;

export type CreateWorkspaceParams = Parameters<(typeof client)['$post']>['0']['json'];

// Create new workspace
export const createWorkspace = async ({ ...rest }: CreateWorkspaceParams) => {
  const response = await client.$post({
    json: rest,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get workspace by its slug or ID
export const getWorkspace = async (idOrSlug: string) => {
  const response = await client[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type UpdateWorkspaceParams = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

// Update workspace
export const updateWorkspace = async (idOrSlug: string, params: UpdateWorkspaceParams) => {
  const response = await client[':idOrSlug'].$put({
    param: { idOrSlug },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete workspaces
export const deleteWorkspaces = async (ids: string[]) => {
  const response = await client.$delete({
    query: { ids },
  });

  await handleResponse(response);
};
