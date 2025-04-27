import { type ContextEntity, type UploadTemplateId, config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import type { UploadParams } from '~/lib/imado/types';
import type { UpdateUserParams } from '~/modules/users/api';
import { meHc } from '#/modules/me/hc';

export const client = meHc(config.backendUrl, clientConfig);

/**
 * Get the current user's details. Retrieves information about the currently authenticated user.
 *
 * @returns The user's data.
 */
export const getSelf = async () => {
  const response = await client.index.$get();

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Get the current user auth details. Retrieves data like sessions, passkey and OAuth.
 *
 * @returns Current user auth data.
 */
export const getSelfAuthInfo = async () => {
  const response = await client.auth.$get();

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Get current user menu. Retrieves menu associated with currently authenticated user.
 *
 * @returns The user menu data.
 */
export const getSelfMenu = async () => {
  const response = await client.menu.$get();

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Update current user details. Updates currently authenticated user information.
 *
 *  @param params User data to update.
 *  @returns The updated user data.
 */
export const updateSelf = async (params: UpdateUserParams) => {
  const response = await client.index.$put({
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

/**
 * Delete current user.
 */
export const deleteSelf = async () => {
  const response = await client.index.$delete();
  await handleResponse(response);
};

/**
 * Terminate user sessions by their IDs.
 *
 * @param sessionIds - An array of session IDs to terminate.
 */
export const deleteMySessions = async (sessionIds: string[]) => {
  const response = await client.sessions.$delete({
    json: { ids: sessionIds },
  });

  await handleResponse(response);
};

/**
 * Get upload token to securely upload files with imado
 *
 * @link https://imado.eu
 */
// TODO remove this and use getUploadToken directly
export const getUploadToken = async (
  type: 'organization' | 'personal',
  templateId: UploadTemplateId,
  query: UploadParams = { public: false, organizationId: undefined },
) => {
  const id = query.organizationId;

  if (!id && type === 'organization') return console.error('Organization id required for organization uploads');

  if (id && type === 'personal') return console.error('Personal uploads should be typed as personal');

  const preparedQuery = {
    public: String(query.public),
    organization: id,
    templateId,
  };

  const response = await client['upload-token'].$get({ query: preparedQuery });

  const json = await handleResponse(response);
  return json.data;
};

type RegisterPasskeyProp = Parameters<(typeof client)['passkey']['$post']>['0']['json'];

/**
 * Create a passkey for current user
 *
 * @param data - Passkey registration data.
 * @returns A boolean indicating success of the passkey registration.
 */
export const createPasskey = async (data: RegisterPasskeyProp) => {
  const apiResponse = await client.passkey.$post({
    json: data,
  });
  const json = await handleResponse(apiResponse);
  return json.success;
};

/**
 * Remove passkey associated with the currently authenticated user.
 *
 * @returns A boolean indicating whether the passkey was successfully removed.
 */
export const deletePasskey = async () => {
  const response = await client.passkey.$delete();

  const json = await handleResponse(response);
  return json.success;
};

export type LeaveEntityQuery = { idOrSlug: string; entityType: ContextEntity };

/**
 * Remove the current user from a specified entity.
 *
 * @param query.idOrSlug - ID or slug of the entity to leave.
 * @param query.entityType - Type of entity to leave.
 * @returns A boolean indicating whether the user successfully left the entity.
 */
export const leaveEntity = async (query: LeaveEntityQuery) => {
  const response = await client.leave.$delete({
    query,
  });

  const json = await handleResponse(response);
  return json.success;
};
