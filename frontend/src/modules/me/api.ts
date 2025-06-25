import { meHc } from '#/modules/me/hc';
import { config, type ContextEntityType, type UploadTemplateId } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { UpdateUserData } from '~/openapi-client';

export const client: ReturnType<typeof meHc> = meHc(config.backendUrl, clientConfig);

/**
 * Get the current user's details. Retrieves information about the currently authenticated user.
 *
 * @returns The user's data.
 */
export const getMe = async () => {
  const response = await client.index.$get();

  return await handleResponse(response);
};

/**
 * Get the current user auth details. Retrieves data like sessions, passkey and OAuth.
 *
 * @returns Current user auth data.
 */
export const getMyAuth = async () => {
  const response = await client.auth.$get();

  return await handleResponse(response);
};

/**
 * Get current user menu. Retrieves menu associated with currently authenticated user.
 *
 * @returns The user menu data.
 */
export const getMyMenu = async () => {
  const response = await client.menu.$get();

  return await handleResponse(response);
};

/**
 * Update current user details. Updates currently authenticated user information.
 *
 *  @param params User data to update.
 *  @returns The updated user data.
 */
export const updateMe = async (params: NonNullable<UpdateUserData['body']>) => {
  const response = await client.index.$put({
    json: params,
  });

  return await handleResponse(response);
};

/**
 * Delete current user.
 */
export const deleteMe = async () => {
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

export type UploadTokenQuery = { public: boolean; templateId: UploadTemplateId; organizationId?: string };

/**
 * Get upload token to securely upload files
 */
export const getUploadToken = async (tokenQuery: UploadTokenQuery) => {
  const preparedQuery = {
    ...tokenQuery,
    public: String(tokenQuery.public),
  };

  const response = await client['upload-token'].$get({ query: preparedQuery });

  return await handleResponse(response);
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
  return await handleResponse(apiResponse);
};

/**
 * Remove passkey associated with the currently authenticated user.
 *
 * @returns A boolean indicating whether the passkey was successfully removed.
 */
export const deletePasskey = async () => {
  const response = await client.passkey.$delete();

  return await handleResponse(response);
};

export type LeaveEntityQuery = { idOrSlug: string; entityType: ContextEntityType };

/**
 * Remove the current user from a specified entity.
 *
 * @param query.idOrSlug - ID or slug of the entity to leave.
 * @param query.entityType - Type of entity to leave.
 * @returns A boolean indicating whether the user successfully left the entity.
 */
export const deleteMyMembership = async (query: LeaveEntityQuery) => {
  const response = await client.leave.$delete({ query });

  return await handleResponse(response);
};
