import { organizationsClient as client, handleResponse } from '.';

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
export const getOrganizationBySlugOrId = async (organization: string) => {
  const response = await client[':organization'].$get({
    param: { organization },
  });

  const json = await handleResponse(response);
  return json.data;
};

export type GetOrganizationsParams = Partial<
  Omit<Parameters<(typeof client.index)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of organizations
export const getOrganizations = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50 }: GetOrganizationsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.index.$get(
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

export type UpdateOrganizationParams = Parameters<(typeof client)[':organization']['$put']>['0']['json'];

// Update an organization
export const updateOrganization = async (organization: string, params: UpdateOrganizationParams) => {
  const response = await client[':organization'].$put({
    param: { organization },
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
