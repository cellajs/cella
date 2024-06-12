import type { EntityType } from 'backend/types/common';
import type { OauthProviderOptions } from '~/modules/auth/oauth-options';
import { type UploadParams, UploadType, type User, type ContextEntity } from '~/types';
import { apiClient, handleResponse } from '.';

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await apiClient.public.counts.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Get upload token to securely upload files with imado: https://imado.eu
export const getUploadToken = async (
  type: UploadType,
  query: UploadParams = { public: false, organizationId: undefined },
) => {
  const id = query.organizationId;

  if (!id && type === UploadType.Organization) {
    return console.error('Organization id required for organization uploads');
  }

  if (id && type === UploadType.Personal) {
    return console.error('Personal uploads should be typed as personal');
  }

  const preparedQuery = {
    public: String(query.public),
    organizationId: id,
  };

  const response = await apiClient['upload-token'].$get({ query: preparedQuery });

  const json = await handleResponse(response);
  return json.data;
};

export interface InviteSystemProps {
  emails: string[];
  role?: User['role'];
}

// Invite users
export const invite = async (values: InviteSystemProps) => {
  const response = await apiClient.invite.$post({
    json: values,
  });

  await handleResponse(response);
};

// Check if slug is available
export const checkSlugAvailable = async (params: { slug: string }) => {
  const response = await apiClient['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

// Check token validation
export const checkToken = async (token: string) => {
  const response = await apiClient['check-token'].$post({
    json: { token },
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get suggestions
export const getSuggestions = async (query: string, type?: EntityType | undefined) => {
  const response = await apiClient.suggestions.$get({
    query: { q: query, type },
  });

  const json = await handleResponse(response);
  return json.data;
};

// Accept an invitation
export const acceptInvite = async ({
  token,
  password,
  oauth,
}: {
  token: string;
  password?: string;
  oauth?: OauthProviderOptions | undefined;
}) => {
  const response = await apiClient.invite[':token'].$post({
    param: { token },
    json: { password, oauth },
  });

  const json = await handleResponse(response);
  return json.success;
};

type RequiredGetMembersParams = {
  idOrSlug: string;
  entityType: ContextEntity;
};

type OptionalGetMembersParams = Partial<
  Omit<Parameters<(typeof apiClient.members)['$get']>['0']['query'], 'limit' | 'offset'>
> & {
  limit?: number;
  page?: number;
};

// Combined type
export type GetMembersParams = RequiredGetMembersParams & OptionalGetMembersParams;

// Get a list of members in an entity
export const getMembers = async (
  { idOrSlug, entityType, q, sort = 'id', order = 'asc', role, page = 0, limit = 50 }: GetMembersParams,
  signal?: AbortSignal,
) => {
  const response = await apiClient.members.$get(
    {
      query: {
        idOrSlug,
        entityType,
        q,
        sort,
        order,
        offset: String(page * limit),
        limit: String(limit),
        role,
      },
    },
    {
      fetch: (input: RequestInfo | URL, init?: RequestInit) => {
        return fetch(input, {
          ...init,
          credentials: 'include',
          signal,
        });
      },
    },
  );

  const json = await handleResponse(response);
  return json.data;
};
