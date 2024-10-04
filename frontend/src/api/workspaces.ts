import { config } from 'config';
import type { InferResponseType } from 'hono/client';
import { workspacesHc } from '#/modules/workspaces/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = workspacesHc(config.backendUrl, clientConfig);

export type CreateWorkspaceParams = Parameters<(typeof client.index)['$post']>['0']['json'] & {
  organizationId: string;
};

// Create new workspace
export const createWorkspace = async ({ organizationId, ...workspace }: CreateWorkspaceParams) => {
  const response = await client.index.$post({
    param: { orgIdOrSlug: organizationId },
    json: workspace,
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetWorkspaceResponse = Extract<InferResponseType<(typeof client)[':idOrSlug']['$get']>, { data: unknown }>['data'];

// Get workspace by its slug or ID
export const getWorkspace = async (idOrSlug: string, orgIdOrSlug: string) => {
  const response = await client[':idOrSlug'].$get({
    param: { idOrSlug, orgIdOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type UpdateWorkspaceParams = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

// Update workspace
export const updateWorkspace = async (idOrSlug: string, orgIdOrSlug: string, params: UpdateWorkspaceParams) => {
  const response = await client[':idOrSlug'].$put({
    param: { idOrSlug, orgIdOrSlug },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete workspaces
export const deleteWorkspaces = async (ids: string[], orgIdOrSlug: string) => {
  const response = await client.index.$delete({
    param: { orgIdOrSlug },
    query: { ids },
  });

  await handleResponse(response);
};
