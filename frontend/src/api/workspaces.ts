import { ApiError, workspaceClient as client } from '.';

export type CreateWorkspaceParams = Parameters<(typeof client.workspaces)['$post']>['0']['json'];

// Create a new workspace
export const createWorkspace = async (params: CreateWorkspaceParams) => {
  const response = await client.workspaces.$post({
    json: params,
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Get an workspace by its slug or ID
export const getWorkspaceBySlugOrId = async (idOrSlug: string) => {
  const response = await client.workspaces[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// export type UpdateWorkspaceParams = Parameters<(typeof client.workspaces)[':idOrSlug']['$put']>['0']['json'];

// TODO: Update a workspace
// export const updateWorkspace = async (idOrSlug: string, params: UpdateWorkspaceParams) => {
//   const response = await client.workspaces[':idOrSlug'].$put({
//     param: { idOrSlug },
//     json: params,
//   });

//   const json = await response.json();
//   if ('error' in json) throw new ApiError(json.error);
//   return json.data;
// };

// TODO: Delete workspaces
// export const deleteWorkspaces = async (ids: string[]) => {
//   const response = await client.workspaces.$delete({
//     query: { ids },
//   });

//   const json = await response.json();
//   if ('error' in json) throw new ApiError(json.error);
//   return;
// };
