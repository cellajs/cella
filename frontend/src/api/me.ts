import { config } from 'config';
import type { UpdateUserParams } from '~/api/users';
import type { ContextEntity } from '~/types/common';
import { meHc } from '#/modules/me/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = meHc(config.backendUrl, clientConfig);

// Get current user
export const getSelf = async () => {
  const response = await client.index.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Get current user menu
export const getUserMenu = async () => {
  const response = await client.menu.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Update self
export const updateSelf = async (params: Omit<UpdateUserParams, 'role'>) => {
  const response = await client.index.$put({
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete self
export const deleteSelf = async () => {
  const response = await client.index.$delete();
  await handleResponse(response);
};

// Terminate user sessions
export const deleteMySessions = async (sessionIds: string[]) => {
  const response = await client.sessions.$delete({
    query: { ids: sessionIds },
  });

  await handleResponse(response);
};

// Remove passkey
export const deletePasskey = async () => {
  const response = await client.passkey.$delete();

  const json = await handleResponse(response);
  return json.success;
};
// Leave entity
export const leaveEntity = async (query: { idOrSlug: string; entityType: ContextEntity }) => {
  const response = await client.leave.$delete({
    query,
  });

  const json = await handleResponse(response);
  return json.success;
};
