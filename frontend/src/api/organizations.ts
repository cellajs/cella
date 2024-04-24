import { ApiError, organizationsClient as client } from '.';
export type CreateOrganizationParams = Parameters<(typeof client.organizations)['$post']>['0']['json'];

// Create a new organization
export const createOrganization = async (params: CreateOrganizationParams) => {
  const response = await client.organizations.$post({
    json: params,
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Get an organization by slug or ID
export const getOrganizationBySlugOrId = async (idOrSlug: string) => {
  const response = await client.organizations[':idOrSlug'].$get({
    param: { idOrSlug },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

// Get a list of organizations
export const getOrganizations = async (
  { q, sort = 'id', order = 'asc', page = 0, limit = 50 }: GetOrganizationsParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.organizations.$get(
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

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export type UpdateOrganizationParams = Parameters<(typeof client.organizations)[':idOrSlug']['$put']>['0']['json'];

// Update an organization
export const updateOrganization = async (idOrSlug: string, params: UpdateOrganizationParams) => {
  const response = await client.organizations[':idOrSlug'].$put({
    param: { idOrSlug },
    json: params,
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
};

export type GetOrganizationsParams = Partial<
  Omit<Parameters<(typeof client.organizations)['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Delete organizations
export const deleteOrganizations = async (ids: string[]) => {
  const response = await client.organizations.$delete({
    query: { ids },
  });

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return;
};

export type GetMembersParams = Partial<
  Omit<Parameters<(typeof client.organizations)[':idOrSlug']['members']['$get']>['0']['query'], 'limit' | 'offset'> & {
    limit: number;
    page: number;
  }
>;

// Get a list of members in an organization
export const getOrganizationMembers = async (
  idOrSlug: string,
  { q, sort = 'id', order = 'asc', role, page = 0, limit = 50 }: GetMembersParams = {},
  signal?: AbortSignal,
) => {
  const response = await client.organizations[':idOrSlug'].members.$get(
    {
      param: { idOrSlug },
      query: {
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

  const json = await response.json();
  if ('error' in json) throw new ApiError(json.error);
  return json.data;
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
