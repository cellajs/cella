import { apiClient, handleResponse } from '.';

const client = apiClient.organizations;

export type CreateOrganizationParams = Parameters<(typeof client)['$post']>['0']['json'];

// Create a new organization
export const createOrganization = async (params: CreateOrganizationParams) => {
  const response = await client.$post({
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

export type GetOrganizationsParams = Partial<
  Omit<Parameters<(typeof client)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of organizations
export const getOrganizations = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50 }: GetOrganizationsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.$get(
    {
      query: {
        q,
        sort,
        order,
        offset: String(page * limit),
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
  const response = await client.$delete({
    query: { ids },
  });

  await handleResponse(response);
};

// INFO: Send newsletter to organizations (not implemented)
export const sendNewsletter = async ({
  organizationIds,
  subject,
  content,
}: {
  organizationIds: string[];
  subject: string;
  content: string;
}) => {
  console.info('Sending newsletter to organizations', organizationIds, subject, content);

  return { success: true };
};
