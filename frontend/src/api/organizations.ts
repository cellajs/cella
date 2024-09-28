import { config } from 'config';
import { organizationsHc } from '#/modules/organizations/hc';
import { clientConfig, handleResponse } from '.';

// Create Hono clients to make requests to the backend
export const client = organizationsHc(config.backendUrl, clientConfig);

export type CreateOrganizationParams = Parameters<(typeof client.index)['$post']>['0']['json'];

// Create a new organization
export const createOrganization = async (params: CreateOrganizationParams) => {
  const response = await client.index.$post({
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Get an organization by slug or ID
export const getOrganization = async (idOrSlug: string) => {
  const response = await client[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetOrganizationsParams = Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
  limit?: number;
  offset?: number;
  page?: number;
};

// Get a list of organizations
export const getOrganizations = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50, offset }: GetOrganizationsParams,
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: typeof offset === 'number' ? String(offset) : String(page * limit),
        limit: String(limit),
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

export type UpdateOrganizationParams = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

// Update an organization
export const updateOrganization = async (idOrSlug: string, params: UpdateOrganizationParams) => {
  const response = await client[':idOrSlug'].$put({
    param: { idOrSlug },
    json: params,
  });

  const json = await handleResponse(response);
  return json.data;
};

// Delete organizations
export const deleteOrganizations = async (ids: string[]) => {
  const response = await client.index.$delete({
    query: { ids },
  });

  await handleResponse(response);
};

// Send newsletter to organizations
export const sendNewsletter = async ({
  organizationIds,
  subject,
  content,
}: {
  organizationIds: string[];
  subject: string;
  content: string;
}) => {
  const response = await client['send-newsletter'].$post({
    json: { organizationIds, subject, content },
  });

  const json = await handleResponse(response);
  return json.success;
};
