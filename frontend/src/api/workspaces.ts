import type { AppWorkspacesType } from 'backend/modules/workspaces/index';
import { config } from 'config';
import { hc } from 'hono/client';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = hc<AppWorkspacesType>(`${config.backendUrl}/workspaces`, clientConfig);

export type CreateWorkspaceParams = Parameters<(typeof client.index)['$post']>['0']['json'];

// Create new workspace
export const createWorkspace = async ({ ...rest }: CreateWorkspaceParams) => {
  const response = await client.index.$post({
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
  const response = await client.index.$delete({
    query: { ids },
  });

  await handleResponse(response);
};
