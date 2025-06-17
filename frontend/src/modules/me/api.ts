import type { UploadTemplateId } from 'config';
import { ApiError } from '~/lib/api';
import {
  type AssignPasskeyData,
  type LeaveEntityData,
  type UpdateSelfData,
  type UploadTokenData,
  assignPasskey,
  deleteSelf,
  getMenu,
  getSelf,
  getSelfAuthInfo,
  leaveEntity,
  removePasskey,
  terminateSessions,
  updateSelf,
  uploadToken,
} from '~/openapi-client';

/**
 * Get the current user's details. Retrieves information about the currently authenticated user.
 *
 * @returns The user's data.
 */
export const getMe = async () => {
  const { data, error } = await getSelf();

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.data;
};

/**
 * Get the current user auth details. Retrieves data like sessions, passkey and OAuth.
 *
 * @returns Current user auth data.
 */
export const getMeAuthInfo = async () => {
  const { data, error } = await getSelfAuthInfo();

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.data;
};

/**
 * Get current user menu. Retrieves menu associated with currently authenticated user.
 *
 * @returns The user menu data.
 */
export const getMyMenu = async () => {
  const { data, error } = await getMenu();

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.data;
};

/**
 * Update current user details. Updates currently authenticated user information.
 *
 *  @param body User data to update.
 *  @returns The updated user data.
 */
export const updateMe = async (body: UpdateSelfData['body']) => {
  const { data, error } = await updateSelf({ body });

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.data;
};

/**
 * Delete current user.
 */
export const deleteMe = async () => {
  const { error } = await deleteSelf();
  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);
};

/**
 * Terminate user sessions by their IDs.
 *
 * @param sessionIds - An array of session IDs to terminate.
 */
export const deleteMySessions = async (sessionIds: string[]) => {
  const { error } = await terminateSessions({ body: { ids: sessionIds } });
  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);
};

export type UploadTokenQuery = { public: boolean; templateId: UploadTemplateId; organizationId?: string };

/**
 * Get upload token to securely upload files
 */
export const getUploadToken = async (tokenQuery: UploadTokenData['query']) => {
  const query = { ...tokenQuery, public: tokenQuery.public };
  const { data, error } = await uploadToken({ query });

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.data;
};

/**
 * Create a passkey for current user
 *
 * @param body - Passkey registration data.
 * @returns A boolean indicating success of the passkey registration.
 */
export const createPasskey = async (body: AssignPasskeyData['body']) => {
  const { data, error } = await assignPasskey({ body });

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.success;
};

/**
 * Remove passkey associated with the currently authenticated user.
 *
 * @returns A boolean indicating whether the passkey was successfully removed.
 */
export const deletePasskey = async () => {
  const { data, error } = await removePasskey();

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.success;
};

/**
 * Remove the current user from a specified entity.
 *
 * @param query.idOrSlug - ID or slug of the entity to leave.
 * @param query.entityType - Type of entity to leave.
 * @returns A boolean indicating whether the user successfully left the entity.
 */
export const deleteMyMembership = async (query: LeaveEntityData['query']) => {
  const { data, error } = await leaveEntity({ query });

  if (error) throw new ApiError({ ...error.error, name: 'ApiError' } as ApiError);

  return data.success;
};
