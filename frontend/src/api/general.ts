import type { AppGeneralType } from 'backend/modules/general/index';
import { config } from 'config';
import { hc } from 'hono/client';
import type { OauthProviderOptions } from '~/modules/auth/oauth-options';
import { type ContextEntity, type Entity, type UploadParams, UploadType, type User } from '~/types/common';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = hc<AppGeneralType>(config.backendUrl, clientConfig);

// Get public counts for about page
export const getPublicCounts = async () => {
  const response = await client.public.counts.$get();

  const json = await handleResponse(response);
  return json.data;
};

// Get upload token to securely upload files with imado: https://imado.eu
export const getUploadToken = async (type: UploadType, query: UploadParams = { public: false, organizationId: undefined }) => {
  const id = query.organizationId;

  if (!id && type === UploadType.Organization) return console.error('Organization id required for organization uploads');

  if (id && type === UploadType.Personal) return console.error('Personal uploads should be typed as personal');

  const preparedQuery = {
    public: String(query.public),
    organizationId: id,
  };

  const response = await client['upload-token'].$get({ query: preparedQuery });

  const json = await handleResponse(response);
  return json.data;
};

export interface SystemInviteProps {
  emails: string[];
  role: User['role'];
}

// Invite users
export const invite = async (values: SystemInviteProps) => {
  const response = await client.invite.$post({
    json: values,
  });

  await handleResponse(response);
};

// Check if slug is available
export const checkSlugAvailable = async (params: { slug: string }) => {
  const response = await client['check-slug'].$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.success;
};

// Check token validation
export const checkToken = async (token: string) => {
  const response = await client['check-token'].$post({
    json: { token },
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get suggestions
export const getSuggestions = async (query: string, type?: Entity | undefined) => {
  const response = await client.suggestions.$get({
    query: { q: query, type },
  });

  const json = await handleResponse(response);
  return json.data;
};

interface AcceptInviteProps {
  token: string;
  password?: string;
  oauth?: OauthProviderOptions | undefined;
}

// Accept an invitation
export const acceptInvite = async ({ token, password, oauth }: AcceptInviteProps) => {
  const response = await client.invite[':token'].$post({
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

type OptionalGetMembersParams = Partial<Omit<Parameters<(typeof client.members)['$get']>['0']['query'], 'limit' | 'offset'>> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Combined type
export type GetMembersParams = RequiredGetMembersParams & OptionalGetMembersParams;

// Get a list of members in an entity
export const getMembers = async (
  { idOrSlug, entityType, q, sort = 'id', order = 'asc', role, page = 0, limit = 50, offset }: GetMembersParams,
  signal?: AbortSignal,
) => {
  const response = await client.members.$get(
    {
      query: {
        idOrSlug,
        entityType,
        q,
        sort,
        order,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
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

// Get metrics
export const getMetrics = async () => {
  const response = await client.metrics.$get();
  const json = await handleResponse(response);
  return json.data;
};
