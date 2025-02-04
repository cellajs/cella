import { config } from 'config';
import { clientConfig, handleResponse } from '~/lib/api';
import { organizationsHc } from '#/modules/organizations/hc';

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
  { q, sort = 'id', order = 'asc', page = 0, limit = config.requestLimits.organizations, offset }: GetOrganizationsParams,
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

export type UpdateOrganizationBody = Parameters<(typeof client)[':idOrSlug']['$put']>['0']['json'];

// Update an organization
export const updateOrganization = async ({ idOrSlug, json }: { idOrSlug: string; json: UpdateOrganizationBody }) => {
  const response = await client[':idOrSlug'].$put({
    param: { idOrSlug },
    json,
  });

  const respJson = await handleResponse(response);
  return respJson.data;
};

// Delete organizations
export const deleteOrganizations = async (ids: string[]) => {
  const response = await client.index.$delete({
    json: { ids },
  });

  await handleResponse(response);
};

export type NewsLetterBody = Parameters<(typeof client)['send-newsletter']['$post']>['0']['json'];

// Send newsletter to organizations
export const sendNewsletter = async ({ body, toSelf = false }: { body: NewsLetterBody; toSelf: boolean }) => {
  const response = await client['send-newsletter'].$post({
    json: body,
    query: { toSelf },
  });

  const json = await handleResponse(response);
  return json.success;
};
